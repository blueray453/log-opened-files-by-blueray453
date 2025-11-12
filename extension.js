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
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { setLogging, setLogFn, journal } from './utils.js'

const AppSystem = global.get_app_system();
const DECODER = new TextDecoder();

export default class MyExtension extends Extension {

    constructor(metadata) {
        super(metadata)
        this._connection = null;
        this._id = 0;
        this._file = null;
    }

    enable() {

        setLogFn((msg, error = false) => {
            let level;
            if (error) {
                level = GLib.LogLevelFlags.LEVEL_CRITICAL;
            } else {
                level = GLib.LogLevelFlags.LEVEL_MESSAGE;
            }

            GLib.log_structured(
                'log-opened-files-by-blueray453',
                level,
                {
                    MESSAGE: `${msg}`,
                    SYSLOG_IDENTIFIER: 'log-opened-files-by-blueray453',
                    CODE_FILE: GLib.filename_from_uri(import.meta.url)[0]
                }
            );
        });


        setLogging(true);

        // journalctl -f -o cat SYSLOG_IDENTIFIER=log-opened-files-by-blueray453

        journal(`Enabled`);

        // Connect to the session bus
        this._connection = Gio.bus_get_sync(Gio.BusType.SESSION, null);

        // Name of the service emitting the D-Bus signal
        let serviceName = null; // Since sender is (null destination)

        // Interface emitting the signal
        let interfaceName = "org.gtk.gio.DesktopAppInfo";

        // Name of the signal
        let signalName = "Launched";

        // D-Bus path emitting the signal
        let objectPath = "/org/gtk/gio/DesktopAppInfo";

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
        journal(`parameters : ${parameters.print(true)}`);
        journal(`parameters Type : ${parameters.get_type_string()}`);

        let [desktopFileBytes, appId, pid, uris, metadata] = parameters.deepUnpack();

        // Convert the byte array to string
        // let desktopFile = imports.byteArray.toString(desktopFileBytes);
        let desktopFile = DECODER.decode(desktopFileBytes);

        let app = Gio.DesktopAppInfo.new_from_filename(desktopFile);

        let app_Id = app.get_id();

        journal(`app_Id : ${app_Id}`);

        // Wait until the app has a window
        this._waitForAppWindow(app_Id, uris, (data) => {
            let json_data = JSON.stringify(data);
            journal(`json_data: ${json_data}`);

            // You can now do anything with `data`
            // Example: this._appendToFile(json_data);
        });

        // GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {

        //     let shell_apps = AppSystem.lookup_app(app_Id);

        //     journal(`shell_apps : ${shell_apps}`);

        //     let windows_array = [];

        //     shell_apps.get_windows().forEach(function (w) {
        //         // console.log("window id : " + w.get_id());
        //         windows_array.push(w.get_id());
        //     })

        //     let pids_array = shell_apps.get_pids();



        // // journal(`Desktop File:", ${desktopFile}`);
        // // journal(`App ID:", ${app_Id}`);
        // // journal(`PID:", ${pid}`);
        // // journal(`URIs:", ${uris.join(', ')}`);

        // // // metadata is a JS object mapping string → Variant
        // // for (let [key, value] of Object.entries(metadata)) {
        // //     journal(`${key}: ${value.deepUnpack()}`);
        // // }

        // // // Parse and handle the signal data
        // // // let [desktop, appid, pid, uris, extras] = params.deep_unpack();
        // // let [filePathBytes, _, processId, urls] = parameters.deep_unpack();

        // // let pid = processId;

        // // // Remove null character from the end of the string if present
        // // desktopFilePath = desktopFilePath.replace(/\0/g, '');
        // // // Assuming the parameters are in the given order

        // // // let filePath = GLib.bytes_to_string(filePathBytes);
        // // // encoded_path = GLib.filename_to_utf8(desktop_file_path)[0];

        // // journal(`before data`);

        // // Create an object with the parsed data
        // let data = {
        //     app_Id: app_Id,
        //     pid: pids_array,
        //     windows: windows_array,
        //     uris: uris
        // };

        // // Convert the object to JSON string
        // let json_data = JSON.stringify(data);

        // journal(`json_data: ${json_data}`);

        // // // Append the JSON data to the file
        // // this._appendToFile(json_data);
        //     return GLib.SOURCE_REMOVE; // important to avoid repeated execution
        // });
    }

    _waitForAppWindow(app_Id, uris, callback) {
        let start = Date.now();

        // Poll every 200ms until we see a window or timeout after 5s
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
            let app = AppSystem.lookup_app(app_Id);

            if (app) {
                let windows = app.get_windows();

                if (windows.length > 0) {
                    let pids = app.get_pids();
                    let windows_array = windows.map(w => w.get_id());

                    let data = {
                        app_Id: app_Id,
                        pid: pids,
                        windows: windows_array,
                        uris: uris
                    };

                    callback(data);
                    return GLib.SOURCE_REMOVE; // stop polling
                }
            }

            // Safety: stop polling after 5 seconds
            if (Date.now() - start > 5000) {
                journal(`Timeout: No window found for ${app_Id}`);
                return GLib.SOURCE_REMOVE;
            }

            return GLib.SOURCE_CONTINUE; // keep waiting
        });
    }

    _appendToFile(data) {
        if (!this._file)
            return;

        // Open the file for appending
        let outputStream = this._file.append_to(Gio.FileCreateFlags.NONE, null);

        // Write the data to the file
        outputStream.write(data + "\n", null);
        outputStream.close(null);
    }
}