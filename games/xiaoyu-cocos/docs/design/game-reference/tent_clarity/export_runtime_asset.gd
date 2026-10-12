extends SceneTree

# Usage: Godot --headless --path <prepared project> --script <this file>
#        -- <generated_master.png> <home_tent_hd_v1.png>
func _initialize() -> void:
    var args := OS.get_cmdline_user_args()
    assert(args.size() == 2)
    var source := Image.load_from_file(args[0])
    assert(source.get_size() == Vector2i(1693,929))
    # Package the regenerated master at more than DPR2 display resolution.
    # This is a downsample, not an enlargement of the 175x96 approved reference.
    source.resize(768,421,Image.INTERPOLATE_LANCZOS)
    quit(int(source.save_png(args[1])))
