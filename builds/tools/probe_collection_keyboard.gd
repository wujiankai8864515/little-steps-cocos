extends SceneTree
class Gallery:
    extends Control
    var index := 0
    var activated := []
    func _unhandled_key_input(e: InputEvent) -> void:
        if not e is InputEventKey or not e.pressed or e.echo: return
        if e.keycode == KEY_RIGHT: index = (index + 1) % 8
        elif e.keycode == KEY_LEFT: index = posmod(index - 1, 8)
        elif e.keycode == KEY_HOME: index = 0
        elif e.keycode == KEY_END: index = 7
        else: return
        get_viewport().set_input_as_handled()
var gallery: Gallery
var buttons: Array[Button] = []
var cases := []
func _initialize() -> void:
    run.call_deferred()
func record(label: String) -> void:
    var owner := get_root().gui_get_focus_owner()
    cases.append({"case":label,"index":gallery.index,"focus":str(owner.name) if owner != null else "","activated":gallery.activated.duplicate()})
func press_key(code: Key, shift := false) -> void:
    var down := InputEventKey.new()
    down.keycode = code
    down.pressed = true
    down.shift_pressed = shift
    Input.parse_input_event(down)
    await process_frame
    var up := InputEventKey.new()
    up.keycode = code
    up.shift_pressed = shift
    Input.parse_input_event(up)
    await process_frame
func run() -> void:
    gallery = Gallery.new()
    get_root().add_child(gallery)
    gallery.size = Vector2(720,1280)
    gallery.mouse_filter = Control.MOUSE_FILTER_IGNORE
    var ButtonScript = load("res://touch_action_button.gd")
    for i in range(4):
        var button: Button = ButtonScript.new()
        button.name = "item_"+str(i)
        button.position = Vector2(58+i*158,816+[24,-5,13,0][i])
        button.size = Vector2(165,182)
        button.focus_mode = Control.FOCUS_ALL
        button.pressed.connect(func(): gallery.activated.append(i))
        gallery.add_child(button)
        buttons.append(button)
    await process_frame
    record("initial")
    await press_key(KEY_RIGHT)
    record("right_without_focus")
    buttons[0].grab_focus()
    await press_key(KEY_RIGHT)
    record("right_with_first_focus")
    await press_key(KEY_END)
    record("end_with_focus")
    await press_key(KEY_TAB)
    record("tab")
    await press_key(KEY_TAB,true)
    record("shift_tab")
    await press_key(KEY_SPACE)
    record("space_release")
    buttons[1].grab_focus()
    for pair in [[KEY_SPACE,true],[KEY_SPACE,false],[KEY_RIGHT,true],[KEY_RIGHT,false]]:
        var event:=InputEventKey.new()
        event.keycode=pair[0]
        event.pressed=pair[1]
        Input.parse_input_event(event)
        Input.flush_buffered_events()
    record("confirm_then_move_same_frame")
    print("COLLECTION_KEYBOARD_NATIVE "+JSON.stringify(cases))
    quit()
