use battle_p2p_core::validation::validate_battle;
use serde_json::{Value, json};

fn minimal() -> Value {
    json!({"map":{"width":1200,"height":700}})
}
fn hierarchy() -> Value {
    json!({"map":{"width":1200,"height":700,"coordinateOrigin":"center"},
    "units":[{"id":"u1","timeline":[{"t":0,"x":0,"y":0}]}],
    "hierarchy":{"roots":["d1"],"nodes":{
        "d1":{"level":"division","parentId":null,"childrenIds":["r1"],"unitIds":[]},
        "r1":{"level":"regiment","parentId":"d1","childrenIds":[],"unitIds":["u1"]}
    }}})
}
fn creator() -> Value {
    let mut battle = hierarchy();
    battle["creatorState"] = json!({"version":2,"coordinateOrigin":"center","duration":30,
    "futureExtension":{"preserve":"untouched"},"items":[
        {"key":"d-key","type":"division","id":"d1","parentId":"","x":0,"y":0,
            "zoom":null,"dir":null,"appearAt":0,"destroyEnabled":false,"destroyAt":null,"timeline":[]},
        {"key":"r-key","type":"regiment","id":"r1","parentId":"d1","x":10,"y":10,
            "zoom":null,"dir":null,"appearAt":0,"destroyEnabled":false,"destroyAt":null,
            "groupMove":true,"groupMoveTimeline":[{"t":0,"enabled":true},{"t":10,"enabled":false}],
            "timeline":[{"t":0,"x":10,"y":10,"explicit":false,"inherited":false}]},
        {"key":"u-key","type":"unit","id":"u1","parentId":"r1","name":"日本語",
            "description":"details","icon":"","x":20,"y":20,"zoom":null,"dir":null,
            "appearAt":0,"destroyEnabled":true,"destroyAt":20,
            "groupOrigin":{"key":"r-key","x":10,"y":10},
            "timeline":[{"t":0,"x":20,"y":20,"explicit":false,"inherited":false},
                {"t":10,"x":100,"y":50,"explicit":true,"inherited":false}]},
        {"key":"camera-key","type":"camera","id":"","parentId":"","x":0,"y":0,
            "zoom":1,"dir":null,"appearAt":null,"destroyEnabled":false,"destroyAt":null,
            "timeline":[{"t":0,"x":0,"y":0,"zoom":1},{"t":10,"x":50,"y":50,"zoom":3}]}
    ]});
    battle
}

#[test]
fn every_current_sample_is_admitted_unchanged() {
    let folder = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../public");
    let mut count = 0;
    for entry in std::fs::read_dir(folder).unwrap() {
        let entry = entry.unwrap();
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with("sample") && name.ends_with(".json") {
            let document: Value =
                serde_json::from_slice(&std::fs::read(entry.path()).unwrap()).unwrap();
            let before = document.clone();
            validate_battle(&document).unwrap_or_else(|error| panic!("{name}: {error}"));
            assert_eq!(document, before);
            count += 1;
        }
    }
    assert_eq!(count, 5);
}

#[test]
fn creator_versions_null_optionals_group_state_and_extensions_are_preserved() {
    for version in [1, 2] {
        let mut document = creator();
        document["creatorState"]["version"] = json!(version);
        let before = document.clone();
        validate_battle(&document).unwrap();
        assert_eq!(document, before);
    }
}

#[test]
fn creator_snapshot_ids_keep_editor_whitespace_while_links_use_trimmed_ids() {
    let mut document = creator();
    document["creatorState"]["items"][0]["id"] = json!(" d1 ");
    document["creatorState"]["items"][1]["id"] = json!(" r1 ");
    validate_battle(&document).unwrap();
}

#[test]
fn map_is_required_positive_and_uses_supported_coordinates() {
    for document in [
        json!({}),
        json!([]),
        json!({"map":null}),
        json!({"map":{"width":0,"height":700}}),
        json!({"map":{"width":1200,"height":-1}}),
        json!({"map":{"width":"1200","height":700}}),
        json!({"map":{"width":1200,"height":700,"coordinateOrigin":"bottom-left"}}),
    ] {
        assert!(validate_battle(&document).is_err(), "{document}");
    }
    validate_battle(&minimal()).unwrap();
}

#[test]
fn rejects_invalid_collection_and_point_shapes() {
    for patch in [
        json!({"units":{}}),
        json!({"characters":[null]}),
        json!({"timeline":[]}),
        json!({"units":[{"id":"u","timeline":[{"t":0,"x":null,"y":0}]}]}),
        json!({"units":[{"id":"u","timeline":[{"t":-1,"x":0,"y":0}]}]}),
        json!({"units":[{"id":"u","timeline":[{"t":0,"x":"NaN","y":0}]}]}),
        json!({"camera":[{"t":0,"x":0,"y":0,"zoom":0}]}),
        json!({"camera":[{"t":0,"x":0,"y":0}]}),
        json!({"units":[{"id":"u","appearAt":10,"destroyAt":5}]}),
    ] {
        let mut document = minimal();
        document
            .as_object_mut()
            .unwrap()
            .extend(patch.as_object().unwrap().clone());
        assert!(validate_battle(&document).is_err(), "{document}");
    }
}

#[test]
fn supports_legacy_tree_inline_timelines_and_top_level_camera() {
    let document = json!({"map":{"width":100,"height":100,"coordinateOrigin":"top-left"},
        "units":[{"id":"u","timeline":[{"t":1,"x":2,"y":3}]}],
        "characters":[{"id":"c","timeline":[{"t":2,"x":3,"y":4}]}],
        "hierarchy":{"legions":[{"id":"l","children":[{"id":"corps","children":[
            {"id":"d","children":[{"id":"r","units":["u"]}]}]}]}]},
        "camera":[{"t":0,"x":0,"y":0,"zoom":1}]});
    validate_battle(&document).unwrap();
}

#[test]
fn timeline_characters_can_define_characters_without_a_definition() {
    let mut document = minimal();
    document["timeline"] = json!({"characters":{"implicit":[{"t":0,"x":0,"y":0}]}});
    validate_battle(&document).unwrap();
    document["timeline"] = json!({"units":{"missing":[{"t":0,"x":0,"y":0}]}});
    assert!(validate_battle(&document).is_err());
}

#[test]
fn rejects_duplicate_and_javascript_reserved_ids() {
    for names in [
        vec!["u", "u"],
        vec![""],
        vec![" "],
        vec!["__proto__"],
        vec!["prototype"],
        vec!["constructor"],
        vec!["u\n"],
    ] {
        let mut document = minimal();
        document["units"] = json!(
            names
                .into_iter()
                .map(|name| json!({"id":name}))
                .collect::<Vec<_>>()
        );
        assert!(validate_battle(&document).is_err());
    }
}

#[test]
fn rejects_unknown_static_links_and_cycles_in_either_graph_representation() {
    let mut cases = vec![];
    let mut value = hierarchy();
    value["hierarchy"]["nodes"]["r1"]["parentId"] = json!("missing");
    cases.push(value);
    let mut value = hierarchy();
    value["hierarchy"]["nodes"]["r1"]["unitIds"] = json!(["missing"]);
    cases.push(value);
    let mut value = hierarchy();
    value["hierarchy"]["roots"] = json!(["missing"]);
    cases.push(value);
    let mut value = hierarchy();
    value["hierarchy"]["nodes"]["d1"]["parentId"] = json!("r1");
    cases.push(value);
    let mut value = hierarchy();
    value["hierarchy"]["nodes"]["r1"]["childrenIds"] = json!(["d1"]);
    cases.push(value);
    for document in cases {
        assert!(validate_battle(&document).is_err(), "{document}");
    }
}

#[test]
fn hierarchy_depth_is_bounded_even_when_children_sort_before_parents() {
    let mut document = minimal();
    let mut nodes = serde_json::Map::new();
    for index in 0..100 {
        nodes.insert(
            format!("n{index:03}"),
            json!({"level":"regiment",
            "childrenIds": if index == 0 {vec![]} else {vec![format!("n{:03}",index-1)]}}),
        );
    }
    document["hierarchy"] = json!({"nodes":nodes});
    assert!(validate_battle(&document).is_err());
}

#[test]
fn validates_event_links_and_rejects_cycles_introduced_after_initial_state() {
    for event in [
        json!({"t":1,"event":"reparent","target":"d1","parent":"r1"}),
        json!({"t":1,"event":"reform","target":"r1","parent":"r1"}),
        json!({"t":1,"event":"transfer","source":"d1","to":"r1"}),
        json!({"t":1,"event":"status","target":"missing","status":"active"}),
        json!({"t":1,"event":"reform","target":"r1","children":["missing"]}),
        json!({"t":1,"event":"arbitrary","target":"r1"}),
    ] {
        let mut document = hierarchy();
        document["events"] = json!([event]);
        assert!(validate_battle(&document).is_err(), "{document}");
    }
}

#[test]
fn supports_current_and_legacy_event_names_in_time_order() {
    let mut document = hierarchy();
    document["events"] = json!([
        {"t":4,"event":"transfer","source":"r1","to":"d1"},
        {"t":0,"event":"status","target":"r1","status":"active"},
        {"t":1,"event":"destroyed","target":"r1"},
        {"t":2,"event":"detach","source":"r1"},
        {"t":5,"event":"reform","target":"r1","children":["u1"]}
    ]);
    validate_battle(&document).unwrap();
}

#[test]
fn rejects_unknown_or_incomplete_creator_versions() {
    for state in [
        json!(null),
        json!({"items":[]}),
        json!({"version":3,"items":[]}),
        json!({"version":2}),
        json!({"version":2,"items":[{"type":"unknown","id":"x"}]}),
    ] {
        let mut document = minimal();
        document["creatorState"] = state;
        assert!(validate_battle(&document).is_err());
    }
}

#[test]
fn rejects_invalid_creator_links_lifecycles_and_duplicate_keys() {
    let mut cases = vec![];
    let mut value = creator();
    value["creatorState"]["items"][2]["parentId"] = json!("missing");
    cases.push(value);
    let mut value = creator();
    value["creatorState"]["items"][2]["parentId"] = json!("d1");
    cases.push(value);
    let mut value = creator();
    value["creatorState"]["items"][2]["destroyAt"] = Value::Null;
    cases.push(value);
    let mut value = creator();
    value["creatorState"]["items"][2]["key"] = json!("r-key");
    cases.push(value);
    let mut value = creator();
    value["creatorState"]["items"][2]["groupOrigin"]["key"] = json!("missing");
    cases.push(value);
    let mut value = creator();
    value["creatorState"]["items"][3]["zoom"] = Value::Null;
    cases.push(value);
    for document in cases {
        assert!(validate_battle(&document).is_err(), "{document}");
    }
}

#[test]
fn permits_bundled_paths_and_signed_raster_data() {
    let png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1kAAAAASUVORK5CYII=";
    for source in [
        "",
        "/maps/sample.svg",
        "/charas/templatebattle/commander.png",
        png,
    ] {
        let mut document = minimal();
        document["map"]["image"] = json!(source);
        validate_battle(&document).unwrap();
    }
}

#[test]
fn rejects_remote_tracking_urls_local_files_svg_and_disguised_images_everywhere() {
    for source in [
        "https://tracker.example/pixel.png",
        "http://127.0.0.1/private",
        "//host/path",
        "file:///etc/passwd",
        "blob:opaque",
        "javascript:alert(1)",
        "/maps/../secret",
        "/maps/%2e%2e/secret",
        "/maps/a%2fb.png",
        "/maps/a\\b.png",
        "/maps/a.svg?x=1",
        "/api/auth/session",
        "data:image/svg+xml;base64,PHN2Zy8+",
        "data:image/png;base64,PHN2Zy8+",
        "data:image/png;base64,abc",
    ] {
        let mut document = creator();
        document["map"]["image"] = json!(source);
        assert!(validate_battle(&document).is_err(), "map: {source}");
        let mut document = creator();
        document["units"][0]["icon"] = json!(source);
        assert!(validate_battle(&document).is_err(), "unit: {source}");
        let mut document = creator();
        document["creatorState"]["items"][2]["icon"] = json!(source);
        assert!(validate_battle(&document).is_err(), "Creator: {source}");
    }
}

#[test]
fn entity_and_keyframe_counts_are_bounded() {
    let mut document = minimal();
    document["units"] = json!(
        (0..10_001)
            .map(|i| json!({"id":format!("u{i}")}))
            .collect::<Vec<_>>()
    );
    assert!(validate_battle(&document).is_err());
    let mut document = minimal();
    document["units"] = json!([{"id":"u","timeline":vec![json!({"t":0,"x":0,"y":0});250_001]}]);
    assert!(validate_battle(&document).is_err());
}

#[test]
fn malformed_force_and_lod_fields_are_rejected() {
    for patch in [
        json!({"forces":[{"name":"Blue","color":"blue"}]}),
        json!({"lod":{"unit":[]}}),
        json!({"lod":{"fadeRange":-1}}),
    ] {
        let mut document = minimal();
        document
            .as_object_mut()
            .unwrap()
            .extend(patch.as_object().unwrap().clone());
        assert!(validate_battle(&document).is_err());
    }
}

#[test]
fn dense_graphs_and_repeated_event_graph_work_are_bounded() {
    let mut document = minimal();
    let mut nodes = serde_json::Map::new();
    let children: Vec<_> = (0..350).map(|i| format!("child-{i}")).collect();
    for name in &children {
        nodes.insert(name.clone(), json!({"level":"regiment"}));
    }
    for index in 0..350 {
        nodes.insert(
            format!("parent-{index}"),
            json!({"level":"division","childrenIds":children}),
        );
    }
    document["hierarchy"] = json!({"nodes":nodes});
    assert!(
        validate_battle(&document)
            .unwrap_err()
            .contains("link budget")
    );

    let mut nodes = serde_json::Map::new();
    for index in 0..100 {
        nodes.insert(format!("child-{index}"), json!({"level":"regiment"}));
        nodes.insert(format!("parent-{index}"), json!({"level":"division"}));
    }
    let children: Vec<_> = (0..100).map(|i| format!("child-{i}")).collect();
    let mut events: Vec<Value> = (0..100)
        .map(|i| {
            json!({"t":i,"event":"reform",
        "target":format!("parent-{i}"),"children":children})
        })
        .collect();
    events.extend(
        (100..400).map(|i| json!({"t":i,"event":"status","target":"parent-0","status":"active"})),
    );
    document["hierarchy"] = json!({"nodes":nodes});
    document["events"] = json!(events);
    assert!(
        validate_battle(&document)
            .unwrap_err()
            .contains("Event/hierarchy validation budget")
    );
}

#[test]
fn small_acyclic_graph_cannot_trigger_exponential_viewer_traversal() {
    let mut nodes = serde_json::Map::new();
    for depth in 0..30 {
        for side in ["left", "right"] {
            let children = if depth == 29 {
                vec![]
            } else {
                vec![
                    format!("left-{}", depth + 1),
                    format!("right-{}", depth + 1),
                ]
            };
            nodes.insert(
                format!("{side}-{depth}"),
                json!({"level":"division","childrenIds":children}),
            );
        }
    }
    let mut document = minimal();
    document["hierarchy"] = json!({"nodes":nodes});
    assert!(
        validate_battle(&document)
            .unwrap_err()
            .contains("expansion budget")
    );
}
