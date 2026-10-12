extends SceneTree
class Gallery:
    extends Control
    var index := 0
    func _unhandled_key_input(e: InputEvent) -> void:
        if not e is InputEventKey or not e.pressed or e.echo: return
        if e.keycode == KEY_LEFT: index = 7
        elif e.keycode == KEY_RIGHT: index = 1
        else: return
        get_viewport().set_input_as_handled()
var cases := {}
func _initialize() -> void:
    run.call_deferred()
func run() -> void:
    var ButtonScript = load("res://touch_action_button.gd")
    for count in range(5):
        for paging in range(4):
            for archives in range(2):
                var page := Control.new()
                get_root().add_child(page)
                page.size = Vector2(720,1280)
                page.mouse_filter = Control.MOUSE_FILTER_IGNORE
                var hanger := Control.new()
                page.add_child(hanger)
                hanger.position=Vector2(26,24)
                hanger.size=Vector2(78,128)
                hanger.mouse_filter=Control.MOUSE_FILTER_IGNORE
                var gallery := Gallery.new()
                page.add_child(gallery)
                gallery.size = page.size
                gallery.mouse_filter = Control.MOUSE_FILTER_IGNORE
                var content := Control.new()
                gallery.add_child(content)
                content.size=gallery.size
                content.mouse_filter=Control.MOUSE_FILTER_IGNORE
                var buttons := {}
                var rects := {"back":Rect2(26+78*.09,24+128*.23,78*.82,128*.76)}
                for slot in range(count):
                    var width := 211 if count<4 else 165
                    var left := 58+slot*(201 if count<4 else 158)
                    if count==1: left=247
                    elif count==2: left=128+slot*263
                    rects["item_"+str(slot)]=Rect2(left,816+[24,-5,13,0][slot],width,182)
                if paging:
                    if paging & 1: rects["previous_page"]=Rect2(45,1096,60,134)
                    if paging & 2: rects["next_page"]=Rect2(385,1096,60,134)
                if archives: rects["archive"]=Rect2(474,990,238,270)
                for key: String in rects:
                    var button: Button = ButtonScript.new()
                    button.name=key
                    button.position=rects[key].position
                    button.size=rects[key].size
                    button.focus_mode=Control.FOCUS_ALL
                    if key=="back":
                        button.position-=hanger.position
                        hanger.add_child(button)
                    else: content.add_child(button)
                    buttons[key]=button
                await process_frame
                var rows := {}
                for key: String in buttons:
                    var directions := {}
                    for direction: String in ["left","up","right","down"]:
                        buttons[key].grab_focus()
                        gallery.index=0
                        var code: Key={"left":KEY_LEFT,"up":KEY_UP,"right":KEY_RIGHT,"down":KEY_DOWN}[direction]
                        var event:=InputEventKey.new()
                        event.keycode=code
                        event.pressed=true
                        Input.parse_input_event(event)
                        await process_frame
                        var owner := get_root().gui_get_focus_owner()
                        directions[direction]={"focus":str(owner.name) if owner!=null else "","fallback":gallery.index!=0}
                        event=InputEventKey.new()
                        event.keycode=code
                        Input.parse_input_event(event)
                        await process_frame
                    rows[key]=directions
                cases[str(count)+"-"+str(paging)+"-"+str(archives)]=rows
                page.free()
    print("COLLECTION_FOCUS_NATIVE "+JSON.stringify(cases))
    quit()
