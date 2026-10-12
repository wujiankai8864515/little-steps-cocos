extends SceneTree

const Art = preload("res://travel/travel_art.gd")
var output := ""
var report := {"renders": [], "errors": []}

func _initialize() -> void:
    output = OS.get_cmdline_user_args()[0]
    ProjectSettings.set_setting("travel/persistence_enabled",false)
    ProjectSettings.set_setting("travel/save_slot","tent_clarity_qa")
    root.size = Vector2i(720,1280)
    root.content_scale_size = Vector2i(720,1280)
    root.content_scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
    call_deferred("run")

func frames(count: int = 5) -> void:
    for i: int in range(count): await process_frame

func run() -> void:
    var page: Control = load("res://home/home_page.tscn").instantiate()
    root.add_child(page)
    page.set_viewport_size(Vector2(720,1280),Rect2(0,0,720,1280))
    page.resume_page(true)
    page.world.freeze_for_review = true
    page.world.hour = 10.0
    page.world.paused = true
    page.world.reset_secondary_pose()
    page.world.ambient_enabled = false
    page.travel.service.wall_clock = func(): return 1000.0
    page.travel.service.depart(128,0.25,214)
    page.travel.props.advance(0.0)
    page.note.dismiss()
    var tent: Polygon2D = page.travel.props.sprites.tent
    var candidate: Texture2D = tent.texture
    var candidate_uv := tent.uv
    var candidate_polygons := tent.polygons
    var candidate_filter := tent.texture_filter
    report["renderer"] = RenderingServer.get_video_adapter_name()
    report["method"] = RenderingServer.get_current_rendering_method()
    report["texture_size"] = [candidate.get_width(),candidate.get_height()]
    report["texture_mipmap_count"] = candidate.get_image().get_mipmap_count()
    report["filter"] = candidate_filter
    report["world_polygon"] = []
    for point: Vector2 in tent.polygon: report.world_polygon.append([point.x,point.y])
    for scale: int in [1,2]:
        root.size = Vector2i(720,1280)*scale
        await frames(8)
        page.set_viewport_size(Vector2(720,1280),Rect2(0,0,720,1280))
        await frames(8)
        for mode: String in ["baseline","candidate"]:
            tent.get_node("ApprovedContact").visible = mode == "candidate"
            if mode == "baseline":
                tent.texture = load("res://travel/assets/home_tent_pixels.png")
                var legacy_uv := PackedVector2Array()
                for point: Vector2 in Art.TENT_SOURCE: legacy_uv.append(point-Art.TENT_TEXTURE_ORIGIN)
                tent.uv = legacy_uv
                tent.polygons = []
                tent.texture_filter = CanvasItem.TEXTURE_FILTER_PARENT_NODE
            else:
                tent.texture = candidate
                tent.uv = candidate_uv
                tent.polygons = candidate_polygons
                tent.texture_filter = candidate_filter
            await frames(5)
            await RenderingServer.frame_post_draw
            var shot := root.get_texture().get_image()
            var prefix := output + "/" + mode + "_dpr" + str(scale)
            shot.save_png(prefix+"_home.png")
            shot.get_region(Rect2i(Vector2i(205,805)*scale,Vector2i(260,145)*scale)).save_png(prefix+"_tent.png")
            var isolated := SubViewport.new()
            isolated.size = Vector2i(720,1280)*scale
            isolated.transparent_bg = true
            isolated.render_target_update_mode = SubViewport.UPDATE_ALWAYS
            root.add_child(isolated)
            isolated.add_child(tent.duplicate())
            isolated.canvas_transform = Transform2D(Vector2(scale,0),Vector2(0,scale),Vector2.ZERO)
            await frames(3)
            await RenderingServer.frame_post_draw
            isolated.get_texture().get_image().get_region(Rect2i(Vector2i(205,805)*scale,Vector2i(260,145)*scale)).save_png(prefix+"_alpha.png")
            isolated.queue_free()
            report.renders.append({"mode":mode,"requested_dpr":scale,"window_size":[root.size.x,root.size.y],"room_size":[page.room.size.x,page.room.size.y],"image_size":[shot.get_width(),shot.get_height()],"visible":tent.visible})
            if shot.get_size() != Vector2i(720,1280)*scale or page.room.size != Vector2i(720,1280)*scale:
                report.errors.append("Physical render size does not match DPR "+str(scale))
    var file := FileAccess.open(output+"/render_report.json",FileAccess.WRITE)
    file.store_string(JSON.stringify(report,"  "))
    page.queue_free()
    await frames()
    quit(0 if report.errors.is_empty() else 2)
