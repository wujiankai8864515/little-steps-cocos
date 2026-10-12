extends SceneTree
func _initialize() -> void:
    var report: Dictionary = {"engine":Engine.get_version_info().string,"checks":[]}
    for name: String in ["travel_map_plate_v5.png","travel_scene_layers_v1.png"]:
        var texture: Texture2D = load("res://"+name)
        var actual: Image = texture.get_image()
        var expected: Image = Image.load_from_file("res://"+name)
        actual.convert(Image.FORMAT_RGBA8)
        expected.convert(Image.FORMAT_RGBA8)
        var same: bool = actual.get_data()==expected.get_data()
        report.checks.append({"name":name,"same_rgba8_pixels":same,"width":actual.get_width(),"height":actual.get_height(),"mipmaps":actual.has_mipmaps()})
        if not same:
            push_error("Pixel mismatch: "+name)
            quit(1)
            return
    var output := FileAccess.open("res://official_import_audit.json",FileAccess.WRITE)
    output.store_string(JSON.stringify(report,"  ")+"\n")
    print(JSON.stringify(report))
    quit()
