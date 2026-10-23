fn main() {
    let _ = servo::ServoBuilder::default();
    gpui_kit::application().run(|cx| {
        gpui_kit::init(cx);
    });
}
