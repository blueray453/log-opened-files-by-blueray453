/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

/* exported init */
const { Gio, GLib } = imports.gi;

var MyExtension = class MyExtension {
    constructor() {
        this._connection = null;
        this._id = 0;
        this._file = null;
    }

    enable() {
        // Connect to the session bus
        this._connection = Gio.bus_get_sync(Gio.BusType.SESSION, null);

        // Name of the service emitting the D-Bus signal
        let serviceName = null; // Since sender is (null destination)

        // D-Bus path emitting the signal
        let objectPath = "/org/gtk/gio/DesktopAppInfo";

        // Interface emitting the signal
        let interfaceName = "org.gtk.gio.DesktopAppInfo";

        // Name of the signal
        let signalName = "Launched";

        // Connect to the signal
        this._id = this._connection.signal_subscribe(
            serviceName,
            interfaceName,
            signalName,
            objectPath,
            null,
            Gio.DBusSignalFlags.NONE,
            this._handleSignal.bind(this)
        );

        // Get the file path
        const file_path = GLib.build_filenamev([GLib.get_home_dir(), 'opened-files.log']);
        this._file = Gio.File.new_for_path(file_path);
    }

    disable() {
        if (this._connection && this._id > 0) {
            this._connection.signal_unsubscribe(this._id);
            this._id = 0;
        }
    }

    _handleSignal(connection, senderName, objectPath, interfaceName, signalName, parameters) {
        // Parse and handle the signal data
        let [filePathBytes, _, processId, urls] = parameters.deep_unpack();

        let pid = processId;

        let decoder = new TextDecoder();
        let desktopFilePath = decoder.decode(filePathBytes);
        // Remove null character from the end of the string if present
        desktopFilePath = desktopFilePath.replace(/\0/g, '');
        // Assuming the parameters are in the given order

        // let filePath = GLib.bytes_to_string(filePathBytes);
        // encoded_path = GLib.filename_to_utf8(desktop_file_path)[0];

        let app = Gio.DesktopAppInfo.new_from_filename(desktopFilePath);

        let app_id = app.get_id();

        log(`before data`);

        // Create an object with the parsed data
        let data = {
            "app_id": app_id,
            "process_id": pid,
            "urls": urls
        };

        // Convert the object to JSON string
        let json_data = JSON.stringify(data);

        // Append the JSON data to the file
        this._appendToFile(json_data);
    }

    _appendToFile(data) {
        if (!this._file)
            return;

        // Open the file for appending
        let outputStream = this._file.append_to(Gio.FileCreateFlags.NONE, null);

        // Write the data to the file
        outputStream.write(data, null);
        outputStream.close(null);
    }
};

function init() {
    return new MyExtension();
}
