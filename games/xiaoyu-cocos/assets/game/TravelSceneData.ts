// Generated from unmodified Godot travel_scene_config.gd by the native oracle.
export const TRAVEL_SCENE:any = {
  "atlas": "res://travel/assets/travel_scene_layers_v1.png",
  "audio": {
    "bus": "Master",
    "duration": 2.8,
    "frequency": 392.0,
    "partials": [
      [
        1.0,
        0.62,
        1.6
      ],
      [
        2.756,
        0.22,
        0.85
      ],
      [
        5.404,
        0.1,
        0.45
      ],
      [
        8.933,
        0.045,
        0.23
      ]
    ],
    "sample_rate": 22050,
    "volume_db": -12.0
  },
  "base": "res://travel/assets/travel_map_plate_v5.png",
  "bell": {
    "body_damping": 1.4,
    "body_pivot": [
      44.378299713134766,
      7.6554999351501465
    ],
    "body_region": "bell_body",
    "body_size": [
      86.46119689941406,
      147.75120544433594
    ],
    "body_stiffness": 11.0,
    "body_wind": 0.12,
    "chain": {
      "at": [
        82.635498046875,
        669.0908813476562
      ],
      "region": "bell_chain",
      "size": [
        21.423999786376953,
        55.119598388671875
      ]
    },
    "clapper_anchor": [
      1.5303000211715698,
      123.25360107421875
    ],
    "clapper_damping": 0.7,
    "clapper_hinge": [
      0.0,
      42.0
    ],
    "clapper_pivot": [
      5.355999946594238,
      0.0
    ],
    "clapper_region": "bell_clapper",
    "clapper_size": [
      10.711999893188477,
      40.57419967651367
    ],
    "clapper_stiffness": 19.0,
    "clapper_wind": 0.08,
    "contact_angle": 0.2,
    "cooldown": 5.4,
    "gust_impulse": 0.8,
    "gust_interval": 8.6,
    "occluder": {
      "at": [
        29.840599060058594,
        686.6986083984375
      ],
      "region": "bell_occluder",
      "size": [
        117.06700134277344,
        210.52630615234375
      ]
    },
    "position": [
      90.28690338134766,
      718.0861206054688
    ],
    "start_gust": 3.5
  },
  "branches": [
    {
      "amplitude": 0.13,
      "at": [
        125.4834976196289,
        587.177001953125
      ],
      "pivot": [
        29.07550048828125,
        4.593299865722656
      ],
      "region": "leaf_foreground_left",
      "size": [
        66.56749725341797,
        46.69860076904297
      ]
    },
    {
      "amplitude": 0.16,
      "at": [
        174.45269775390625,
        623.9234008789062
      ],
      "pivot": [
        31.370899200439453,
        3.0622000694274902
      ],
      "region": "leaf_foreground_middle",
      "size": [
        52.02980041503906,
        41.339698791503906
      ]
    },
    {
      "amplitude": 0.11,
      "at": [
        167.56640625,
        666.7943115234375
      ],
      "pivot": [
        29.07550048828125,
        3.0622000694274902
      ],
      "region": "leaf_foreground_right",
      "size": [
        59.68119812011719,
        42.87080001831055
      ]
    },
    {
      "amplitude": 0.22,
      "at": [
        664.9097290039062,
        622.3922729492188
      ],
      "pivot": [
        14.537699699401855,
        14.545499801635742
      ],
      "region": "leaf_midground",
      "size": [
        28.310300827026367,
        27.559799194335938
      ]
    }
  ],
  "canvas": [
    720.0,
    1280.0
  ],
  "clouds": [
    {
      "at": [
        268.5653076171875,
        183.7321014404297
      ],
      "opacity": 0.42,
      "phase": 0.0,
      "region": "cloud_far",
      "size": [
        192.81619262695312,
        42.87080001831055
      ],
      "speed": 1.55
    },
    {
      "at": [
        516.4718017578125,
        515.2152709960938
      ],
      "opacity": 0.34,
      "phase": 1.7,
      "region": "cloud_mid",
      "size": [
        163.74070739746094,
        40.57419967651367
      ],
      "speed": -2.05
    }
  ],
  "id": "autumn_temple_v1",
  "leaves": {
    "area": [
      0.0,
      180.0,
      720.0,
      998.0
    ],
    "count": 18,
    "drift": 4.3,
    "regions": [
      "leaf_a",
      "leaf_b",
      "leaf_c"
    ],
    "size": [
      16.0,
      19.0
    ],
    "speed": 19.0,
    "spin": 0.21,
    "sway": 17.0,
    "sway_frequency": 0.86,
    "turn_amplitude": 0.65,
    "turn_frequency": 1.7
  },
  "light": {
    "beam_color": [
      1.0,
      0.8799999952316284,
      0.6299999952316284,
      1.0
    ],
    "beam_exclusions": [
      [
        0.0,
        0.0,
        720.0,
        178.0
      ],
      [
        243.0,
        733.0,
        390.0,
        212.0
      ],
      [
        201.0,
        699.0,
        357.0,
        73.0
      ],
      [
        225.0,
        1180.0,
        270.0,
        62.0
      ]
    ],
    "beam_portals": [
      {
        "at": [
          245.0,
          174.0
        ],
        "end_width": 166.0,
        "id": "upper_tree_gap",
        "length": 650.0,
        "phase": 0.0,
        "start_width": 24.0,
        "strength": 0.52
      },
      {
        "at": [
          407.0,
          213.0
        ],
        "end_width": 125.0,
        "id": "creek_canopy_gap",
        "length": 525.0,
        "phase": 1.1,
        "start_width": 18.0,
        "strength": 0.44
      },
      {
        "at": [
          595.0,
          316.0
        ],
        "end_width": 143.0,
        "id": "temple_eave_gap",
        "length": 520.0,
        "phase": 2.3,
        "start_width": 21.0,
        "strength": 0.46
      },
      {
        "at": [
          153.0,
          620.0
        ],
        "end_width": 180.0,
        "id": "foreground_eave_gap",
        "length": 574.0,
        "phase": 3.4,
        "start_width": 27.0,
        "strength": 0.5
      }
    ],
    "beams_enabled": true,
    "dawn_color": [
      1.0,
      0.8100000023841858,
      0.6600000262260437,
      1.0
    ],
    "day_color": [
      1.0,
      0.9800000190734863,
      0.9100000262260437,
      1.0
    ],
    "foreground_rect": [
      0.0,
      728.0,
      720.0,
      461.0
    ],
    "moon": [
      543.0,
      190.0
    ],
    "night_color": [
      0.38999998569488525,
      0.49000000953674316,
      0.6600000262260437,
      1.0
    ],
    "scene_rect": [
      0.0,
      171.0,
      720.0,
      558.0
    ],
    "shadows": [
      {
        "at": [
          164.0,
          278.0
        ],
        "height": 35.0,
        "width": 34.0
      },
      {
        "at": [
          494.0,
          427.0
        ],
        "height": 44.0,
        "width": 40.0
      },
      {
        "at": [
          582.0,
          662.0
        ],
        "height": 38.0,
        "width": 28.0
      }
    ],
    "sky": [
      80.0,
      152.0,
      580.0,
      136.0
    ],
    "stars": [
      [
        346.0,
        185.0
      ],
      [
        400.0,
        199.0
      ],
      [
        472.0,
        174.0
      ],
      [
        598.0,
        199.0
      ]
    ],
    "sun_left": [
      232.0,
      172.0
    ],
    "sun_radius": 16.0,
    "sun_right": [
      560.0,
      172.0
    ],
    "sun_top": [
      380.0,
      148.0
    ]
  },
  "regions": {
    "bell_body": [
      4.0,
      4.0,
      142.0,
      242.0
    ],
    "bell_chain": [
      188.0,
      4.0,
      24.0,
      70.0
    ],
    "bell_clapper": [
      154.0,
      4.0,
      24.0,
      112.0
    ],
    "bell_occluder": [
      218.0,
      4.0,
      142.0,
      264.0
    ],
    "cloud_far": [
      4.0,
      282.0,
      300.0,
      65.0
    ],
    "cloud_mid": [
      4.0,
      359.0,
      280.0,
      66.0
    ],
    "leaf_a": [
      372.0,
      223.0,
      36.0,
      29.0
    ],
    "leaf_b": [
      420.0,
      223.0,
      36.0,
      29.0
    ],
    "leaf_c": [
      468.0,
      223.0,
      36.0,
      29.0
    ],
    "leaf_foreground_left": [
      372.0,
      4.0,
      85.0,
      64.0
    ],
    "leaf_foreground_middle": [
      372.0,
      152.0,
      74.0,
      59.0
    ],
    "leaf_foreground_right": [
      372.0,
      80.0,
      81.0,
      60.0
    ],
    "leaf_midground": [
      464.0,
      152.0,
      40.0,
      39.0
    ]
  },
  "route": {
    "actor_foot": [
      38.0,
      49.0
    ],
    "actor_size": [
      76.0,
      57.0
    ],
    "landmarks": [
      {
        "anchor": [
          164.0,
          287.0
        ],
        "name": "山门",
        "rect": [
          116.0,
          257.0,
          72.0,
          29.0
        ]
      },
      {
        "anchor": [
          293.0,
          475.0
        ],
        "name": "石桥",
        "rect": [
          232.0,
          491.0,
          76.0,
          29.0
        ]
      },
      {
        "anchor": [
          358.0,
          528.0
        ],
        "name": "溪边",
        "rect": [
          323.0,
          537.0,
          68.0,
          29.0
        ]
      },
      {
        "anchor": [
          490.0,
          413.0
        ],
        "baked": true,
        "name": "秋叶寺",
        "rect": [
          446.0,
          316.0,
          91.0,
          35.0
        ]
      },
      {
        "anchor": [
          594.0,
          549.0
        ],
        "name": "山路",
        "rect": [
          567.0,
          540.0,
          67.0,
          29.0
        ]
      },
      {
        "anchor": [
          588.0,
          660.0
        ],
        "name": "归途山门",
        "rect": [
          534.0,
          672.0,
          116.0,
          30.0
        ]
      }
    ],
    "line_width": 2.4,
    "nodes": [
      {
        "at": [
          164.0,
          298.0
        ],
        "id": "mountain_gate",
        "name": "山门"
      },
      {
        "at": [
          225.0,
          320.0
        ],
        "id": "forest_path",
        "name": "林间小径"
      },
      {
        "at": [
          266.0,
          369.0
        ],
        "id": "creek_bend",
        "name": "溪畔弯道"
      },
      {
        "at": [
          316.0,
          390.0
        ],
        "id": "bridge_turn",
        "name": "石桥岔路"
      },
      {
        "at": [
          367.0,
          420.0
        ],
        "id": "river_view",
        "name": "临水坡"
      },
      {
        "at": [
          414.0,
          443.0
        ],
        "id": "temple_approach",
        "name": "寺前小径"
      },
      {
        "at": [
          466.0,
          450.0
        ],
        "id": "temple",
        "name": "秋叶寺"
      },
      {
        "at": [
          508.0,
          477.0
        ],
        "id": "hill_path",
        "name": "山路"
      },
      {
        "at": [
          563.0,
          525.0
        ],
        "id": "maple_woods",
        "name": "枫林"
      },
      {
        "at": [
          647.0,
          591.0
        ],
        "id": "cloud_ridge",
        "name": "云边坡"
      },
      {
        "at": [
          583.0,
          665.0
        ],
        "id": "return_gate",
        "name": "归途山门"
      }
    ],
    "segments": [
      [
        [
          164.0,
          298.0
        ],
        [
          193.0,
          306.0
        ],
        [
          225.0,
          320.0
        ]
      ],
      [
        [
          225.0,
          320.0
        ],
        [
          245.0,
          333.0
        ],
        [
          266.0,
          369.0
        ]
      ],
      [
        [
          266.0,
          369.0
        ],
        [
          288.0,
          379.0
        ],
        [
          316.0,
          390.0
        ]
      ],
      [
        [
          316.0,
          390.0
        ],
        [
          343.0,
          402.0
        ],
        [
          367.0,
          420.0
        ]
      ],
      [
        [
          367.0,
          420.0
        ],
        [
          380.0,
          431.0
        ],
        [
          414.0,
          443.0
        ]
      ],
      [
        [
          414.0,
          443.0
        ],
        [
          434.0,
          447.0
        ],
        [
          466.0,
          450.0
        ]
      ],
      [
        [
          466.0,
          450.0
        ],
        [
          479.0,
          456.0
        ],
        [
          508.0,
          477.0
        ]
      ],
      [
        [
          508.0,
          477.0
        ],
        [
          538.0,
          508.0
        ],
        [
          563.0,
          525.0
        ]
      ],
      [
        [
          563.0,
          525.0
        ],
        [
          599.0,
          539.0
        ],
        [
          624.0,
          562.0
        ],
        [
          647.0,
          591.0
        ]
      ],
      [
        [
          647.0,
          591.0
        ],
        [
          665.0,
          617.0
        ],
        [
          636.0,
          639.0
        ],
        [
          610.0,
          654.0
        ],
        [
          583.0,
          665.0
        ]
      ]
    ],
    "unwalked": [
      0.47999998927116394,
      0.33000001311302185,
      0.17000000178813934,
      0.6499999761581421
    ],
    "walked": [
      1.0,
      0.7699999809265137,
      0.36000001430511475,
      0.8399999737739563
    ],
    "walked_width": 3.6
  },
  "wind": {
    "base": 0.24,
    "base_frequency": 1.37,
    "branch_flutter": 0.22,
    "branch_flutter_frequency": 2.1,
    "damping": 5.1,
    "gust": 0.68,
    "period": 7.4,
    "ripple_amplitude": 0.1,
    "ripple_frequency": 3.13,
    "stiffness": 17.0
  }
};
