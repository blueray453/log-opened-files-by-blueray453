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
const FILE_PATH = GLib.build_filenamev([GLib.get_home_dir(), 'opened-files.log']);

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
        this._file = Gio.File.new_for_path(FILE_PATH);
    }

    disable() {
        if (this._connection && this._id > 0) {
            this._connection.signal_unsubscribe(this._id);
            this._id = 0;
        }
    }

    _handleSignal(connection, senderName, objectPath, interfaceName, signalName, parameters) {
        // journal(`parameters : ${parameters.print(true)}`);
        // journal(`parameters Type : ${parameters.get_type_string()}`);

        let [desktopFileBytes, appId, pid, uris, metadata] = parameters.deepUnpack();

        // Convert the byte array to string
        // let desktopFile = imports.byteArray.toString(desktopFileBytes);
        let desktopFile = DECODER.decode(desktopFileBytes);

        let app = Gio.DesktopAppInfo.new_from_filename(desktopFile);

        let app_Id = app.get_id();

        journal(`app_Id : ${app_Id}`);

        // Wait until the app has a window
        this._waitForAppWindow(app_Id, (data) => {
            this.updateAppEntry(app_Id, data.windows, uris);
        });
    }

    _waitForAppWindow(app_Id, callback) {

        let attempts = 0;
        let maxAttempts = 15;  // ~1500ms if interval is 100ms

        // Poll every 100ms until we see a window or timeout after 5s
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            let app = AppSystem.lookup_app(app_Id);

            if (app) {
                let windows = app.get_windows();

                if (windows.length > 0) {
                    let pids = app.get_pids();
                    let windows_array = windows.map(w => w.get_id());

                    let data = {
                        pids: pids,
                        windows: windows_array
                    };

                    callback(data);
                    return GLib.SOURCE_REMOVE; // stop polling
                }
            }

            // Stop after N polling rounds
            attempts++;

            if (attempts >= maxAttempts) {
                journal(`Timeout: No window found for ${app_Id}`);
                return GLib.SOURCE_REMOVE;
            }

            return GLib.SOURCE_CONTINUE; // keep waiting
        });
    }

    updateAppEntry(app_Id, windows, uris) {

        journal(`Running updateAppEntry`);

        let map = this.loadAppMap();

        journal(`map in updateAppEntry is ${map}`);

        // Overwrite or add new entry for this app
        map[app_Id] = {
            windows: windows,
            uris: uris
        };

        this.saveAppMap(map);
    }

    loadAppMap() {
        journal(`Running loadAppMap`);
        if (!GLib.file_test(FILE_PATH, GLib.FileTest.EXISTS))
            return {};
        journal(`Running loadAppMap: File Exists`);
        journal(`Running loadAppMap Path: ${FILE_PATH}`);

        let [ok, content] = GLib.file_get_contents(FILE_PATH);
        if (!ok || !content)
            return {};

        journal(`Running loadAppMap content: ${content}`);

        let str = DECODER.decode(content); // <-- convert bytes to string

        journal(`Running loadAppMap str: ${str}`);

        try {
            return JSON.parse(str || '{}');
        } catch (e) {
            journal(`Failed to parse JSON: ${e}`);
            return {};
        }
    }

    saveAppMap(map) {
        journal(`Running saveAppMap`);
        GLib.file_set_contents(FILE_PATH, JSON.stringify(map, null, 2));
    }
}