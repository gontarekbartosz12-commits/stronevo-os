// STRONEVO OS desktop — entrypoint (Windows: bez okna konsoli)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    stronevo_os_desktop_lib::run();
}
