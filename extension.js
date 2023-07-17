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

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

class Extension {
    enable() {
        this._connection = Gio.DBus.session;

        // var interface = Gio.DBusObject.get_interface("org.gtk.gio.DesktopAppInfo").get_info().lookup_signal("Launched");

        this.handlerId = this._connection.signal_subscribe(null, "org.gtk.gio.DesktopAppInfo", "Launched", "/org/gtk/gio/DesktopAppInfo", null, 0, _parseSignal);

        function _parseSignal(connection, sender, path, iface, signal, params) {

            // log("Calling _parseSignal");

            let focused_window_id = global.get_window_actors().find(w => w.meta_window.has_focus() == true).meta_window.get_id();

            const app_path = params.get_child_value(0).get_bytestring();
            const app = Gio.DesktopAppInfo.new_from_filename(String.fromCharCode(...app_path));
            const app_id = app.get_id();
            const app_pid = params.get_child_value(2).get_int64();
            const opened_file_path = params.get_child_value(3).get_strv();

            // const variantString = params.print(true);
            // log("variantString : " + variantString);
            // log("variantString unpack : " + params.unpack());
            // log("variantString deep unpack : " + params.deepUnpack());
            // log("variantString recursive unpack : " + params.recursiveUnpack());

            // log("app_path : " + app_path);
            // log("app_id : " + app_id);
            // log("app_pid : " + app_pid);
            // log("app_path : " + app_path);
            // // log("apppath type : " + typeof apppath);
            // log("opened_file_path : " + opened_file_path);

            if (opened_file_path) {
                const file_path = GLib.build_filenamev([GLib.get_home_dir(), 'opened-files.log']);
                const file = Gio.File.new_for_path(file_path);
                // const outputStreamCreate = file.create(Gio.FileCreateFlags.NONE, null);
                const outputStreamAppend = file.append_to(Gio.FileCreateFlags.NONE, null);
                var to_write = focused_window_id + ' ' + app_id + ' ' + app_pid + ' ' + opened_file_path + '\n'
                const bytesWritten = outputStreamAppend.write_all(to_write, null);
            }
        }
    }

    disable() {
        this._connection.signal_unsubscribe(this.handlerId);
        log(`disabling ${Me.metadata.name}`);
    }
}

function init() {
    log(`initializing ${Me.metadata.name}`);
    return new Extension();
}
