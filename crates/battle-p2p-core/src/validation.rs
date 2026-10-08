//! P2P admission checks for the document shapes consumed by the current Viewer/Creator.
//! The original bytes are never rewritten. Unknown extension fields are retained.
//! Local file import deliberately remains independent of this stricter sharing policy.
use serde_json::{Map, Value};
use std::collections::{BTreeMap, BTreeSet};

const MAX_ENTITIES: usize = 10_000;
const MAX_POINTS: usize = 250_000;
const MAX_EVENTS: usize = 10_000;
const MAX_GRAPH_DEPTH: usize = 64;
const MAX_GRAPH_WORK: usize = 100_000;
const MAX_EVENT_GRAPH_WORK: usize = 2_000_000;
type Object = Map<String, Value>;

fn object<'a>(value: &'a Value, at: &str) -> Result<&'a Object, String> {
    value
        .as_object()
        .ok_or_else(|| format!("{at} must be an object"))
}
fn array<'a>(value: &'a Value, at: &str) -> Result<&'a [Value], String> {
    value
        .as_array()
        .map(Vec::as_slice)
        .ok_or_else(|| format!("{at} must be an array"))
}
fn required<'a>(value: &'a Object, key: &str) -> Result<&'a Value, String> {
    value.get(key).ok_or_else(|| format!("{key} is required"))
}
fn text<'a>(value: &'a Value, at: &str) -> Result<&'a str, String> {
    value
        .as_str()
        .ok_or_else(|| format!("{at} must be a string"))
}
fn finite(value: &Value, at: &str) -> Result<f64, String> {
    value
        .as_f64()
        .filter(|n| n.is_finite())
        .ok_or_else(|| format!("{at} must be finite"))
}
fn nonnegative(value: &Value, at: &str) -> Result<f64, String> {
    let n = finite(value, at)?;
    if n < 0.0 {
        return Err(format!("{at} must be nonnegative"));
    }
    Ok(n)
}
fn positive(value: &Value, at: &str) -> Result<f64, String> {
    let n = finite(value, at)?;
    if n <= 0.0 {
        return Err(format!("{at} must be positive"));
    }
    Ok(n)
}
fn id(value: &Value) -> Result<&str, String> {
    checked_id(text(value, "id")?)
}
fn checked_id(value: &str) -> Result<&str, String> {
    if value.trim().is_empty()
        || value.len() > 1024
        || value.chars().any(char::is_control)
        || matches!(value, "__proto__" | "prototype" | "constructor")
    {
        return Err("Invalid or unsafe identifier".into());
    }
    Ok(value)
}
fn string_fields(value: &Object, fields: &[&str]) -> Result<(), String> {
    for key in fields {
        if let Some(v) = value.get(*key) {
            text(v, key)?;
        }
    }
    Ok(())
}
fn boolean_fields(value: &Object, fields: &[&str]) -> Result<(), String> {
    for key in fields {
        if let Some(v) = value.get(*key)
            && !v.is_boolean()
        {
            return Err(format!("{key} must be boolean"));
        }
    }
    Ok(())
}
fn optional_number(
    value: &Object,
    key: &str,
    nullable: bool,
    minimum: u8,
) -> Result<Option<f64>, String> {
    let Some(v) = value.get(key) else {
        return Ok(None);
    };
    if nullable && v.is_null() {
        return Ok(None);
    }
    Ok(Some(match minimum {
        1 => nonnegative(v, key)?,
        2 => positive(v, key)?,
        _ => finite(v, key)?,
    }))
}

/// Remote URLs are intentionally disallowed: rendering a shared document must not
/// contact an author's tracking URL or a recipient's local/private network.
fn image(value: &Value) -> Result<(), String> {
    if value.is_null() {
        return Ok(());
    }
    let source = text(value, "image")?;
    if source.is_empty() {
        return Ok(());
    }
    if source.starts_with("/maps/") || source.starts_with("/charas/") {
        if source.split('/').skip(1).all(|segment| {
            !segment.is_empty()
                && segment != "."
                && segment != ".."
                && segment
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b))
        }) {
            return Ok(());
        }
        return Err("Unsafe bundled image path".into());
    }
    let (mime, encoded) = source
        .split_once(";base64,")
        .ok_or("Image must be a bundled path or embedded raster image")?;
    if !matches!(
        mime,
        "data:image/png" | "data:image/jpeg" | "data:image/webp"
    ) {
        return Err("Unsupported embedded image format".into());
    }
    if encoded.is_empty() || encoded.len() % 4 != 0 {
        return Err("Invalid image base64".into());
    }
    let bytes = encoded.as_bytes();
    let padding = bytes.iter().rev().take_while(|&&b| b == b'=').count();
    if padding > 2 {
        return Err("Invalid image base64 padding".into());
    }
    let mut prefix = Vec::with_capacity(12);
    let mut accumulator = 0_u32;
    let mut bits = 0;
    for &byte in &bytes[..bytes.len() - padding] {
        let number = match byte {
            b'A'..=b'Z' => byte - b'A',
            b'a'..=b'z' => byte - b'a' + 26,
            b'0'..=b'9' => byte - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            _ => return Err("Invalid image base64".into()),
        };
        accumulator = (accumulator << 6) | u32::from(number);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            if prefix.len() < 12 {
                prefix.push((accumulator >> bits) as u8);
            }
        }
    }
    if bits > 0 && accumulator & ((1 << bits) - 1) != 0 {
        return Err("Noncanonical image base64 padding".into());
    }
    let valid = match mime {
        "data:image/png" => prefix.starts_with(b"\x89PNG\r\n\x1a\n"),
        "data:image/jpeg" => prefix.starts_with(b"\xff\xd8\xff"),
        _ => prefix.starts_with(b"RIFF") && prefix.get(8..12) == Some(b"WEBP"),
    };
    if !valid {
        return Err("Embedded image signature does not match its format".into());
    }
    Ok(())
}
fn image_fields(value: &Object) -> Result<(), String> {
    for key in ["image", "icon"] {
        if let Some(v) = value.get(key) {
            image(v)?;
        }
    }
    Ok(())
}

#[derive(Default)]
struct Budget {
    entities: usize,
    points: usize,
}
impl Budget {
    fn entities(&mut self, count: usize) -> Result<(), String> {
        self.entities += count;
        if self.entities > MAX_ENTITIES {
            return Err("Too many Battle/Creator entities".into());
        }
        Ok(())
    }
    fn points(&mut self, count: usize) -> Result<(), String> {
        self.points += count;
        if self.points > MAX_POINTS {
            return Err("Too many timeline points".into());
        }
        Ok(())
    }
}
fn position(value: &Value) -> Result<(), String> {
    let value = object(value, "position")?;
    finite(required(value, "x")?, "x")?;
    finite(required(value, "y")?, "y")?;
    Ok(())
}
fn timeline(value: &Value, camera: bool, budget: &mut Budget) -> Result<(), String> {
    let points = array(value, "timeline")?;
    budget.points(points.len())?;
    for point in points {
        position(point)?;
        let point = object(point, "timeline point")?;
        nonnegative(required(point, "t")?, "t")?;
        optional_number(point, "dir", false, 0)?;
        if camera {
            positive(required(point, "zoom")?, "zoom")?;
        } else {
            optional_number(point, "zoom", false, 2)?;
        }
        boolean_fields(point, &["explicit", "inherited", "interpolate"])?;
    }
    Ok(())
}
fn group_timeline(value: &Value, budget: &mut Budget) -> Result<(), String> {
    let points = array(value, "groupMoveTimeline")?;
    budget.points(points.len())?;
    for point in points {
        let point = object(point, "groupMoveTimeline point")?;
        nonnegative(required(point, "t")?, "t")?;
        if !required(point, "enabled")?.is_boolean() {
            return Err("enabled must be boolean".into());
        }
    }
    Ok(())
}
fn entity(value: &Object, budget: &mut Budget) -> Result<(), String> {
    string_fields(value, &["name", "description", "force", "color"])?;
    image_fields(value)?;
    let appear = optional_number(value, "appearAt", false, 1)?.unwrap_or(0.0);
    if optional_number(value, "destroyAt", false, 1)?.is_some_and(|destroy| destroy < appear) {
        return Err("destroyAt precedes appearAt".into());
    }
    if let Some(v) = value.get("timeline") {
        timeline(v, false, budget)?;
    }
    if let Some(v) = value.get("pos") {
        position(v)?;
    }
    boolean_fields(value, &["groupMove"])?;
    if let Some(v) = value.get("groupMoveTimeline") {
        group_timeline(v, budget)?;
    }
    Ok(())
}
fn definitions(value: Option<&Value>, budget: &mut Budget) -> Result<BTreeSet<String>, String> {
    let mut ids = BTreeSet::new();
    if let Some(value) = value {
        let values = array(value, "definitions")?;
        budget.entities(values.len())?;
        for value in values {
            let value = object(value, "definition")?;
            let name = id(required(value, "id")?)?;
            if !ids.insert(name.to_owned()) {
                return Err("Duplicate definition id".into());
            }
            entity(value, budget)?;
        }
    }
    Ok(ids)
}
fn ids(value: &Value) -> Result<Vec<String>, String> {
    let mut seen = BTreeSet::new();
    let mut result = Vec::new();
    for value in array(value, "identifiers")? {
        let name = id(value)?.to_owned();
        if !seen.insert(name.clone()) {
            return Err("Duplicate identifier link".into());
        }
        result.push(name);
    }
    Ok(result)
}
fn link(value: &str, known: &BTreeSet<String>) -> Result<(), String> {
    if !known.contains(value) {
        return Err(format!("Unknown identifier link: {value}"));
    }
    Ok(())
}

#[derive(Clone)]
struct Node {
    level: String,
    parent: Option<String>,
    children: Vec<String>,
}
type Nodes = BTreeMap<String, Node>;
fn level(value: &str) -> Result<(), String> {
    if !matches!(value, "legion" | "corps" | "division" | "regiment") {
        return Err("Invalid hierarchy level".into());
    }
    Ok(())
}
fn parent(value: Option<&Value>) -> Result<Option<String>, String> {
    match value {
        None | Some(Value::Null) => Ok(None),
        Some(value) => Ok(Some(id(value)?.to_owned())),
    }
}
fn graph_work(nodes: &Nodes) -> usize {
    nodes.values().fold(nodes.len(), |work, node| {
        work.saturating_add(node.children.len())
            .saturating_add(usize::from(node.parent.is_some()))
    })
}
fn graph_valid(nodes: &Nodes) -> Result<(), String> {
    if graph_work(nodes) > MAX_GRAPH_WORK {
        return Err("Hierarchy link budget exceeded".into());
    }
    // Include both representations: rendering consumes child lists as well as parents.
    let mut edges: BTreeMap<&str, BTreeSet<&str>> = nodes
        .keys()
        .map(|id| (id.as_str(), BTreeSet::new()))
        .collect();
    for (name, node) in nodes {
        for child in &node.children {
            if !nodes.contains_key(child) {
                return Err("Unknown hierarchy child".into());
            }
            edges.get_mut(name.as_str()).unwrap().insert(child);
        }
        if let Some(parent) = &node.parent {
            edges
                .get_mut(parent.as_str())
                .ok_or("Unknown hierarchy parent")?
                .insert(name);
        }
    }
    let mut complete = BTreeMap::new();
    fn visit<'a>(
        name: &'a str,
        edges: &BTreeMap<&'a str, BTreeSet<&'a str>>,
        active: &mut BTreeSet<&'a str>,
        complete: &mut BTreeMap<&'a str, (usize, usize)>,
        depth: usize,
    ) -> Result<(usize, usize), String> {
        if depth > MAX_GRAPH_DEPTH {
            return Err("Hierarchy is too deep".into());
        }
        if let Some(result) = complete.get(name) {
            return Ok(*result);
        }
        if !active.insert(name) {
            return Err("Hierarchy cycle".into());
        }
        let mut height = 0;
        let mut expansion = 1_usize;
        for child in &edges[name] {
            let (child_height, child_expansion) = visit(child, edges, active, complete, depth + 1)?;
            height = height.max(1 + child_height);
            expansion = expansion.saturating_add(child_expansion);
            // The current selected-hierarchy traversal does not memoize shared
            // descendants. A small acyclic graph can otherwise expand exponentially.
            if expansion > MAX_GRAPH_WORK {
                return Err("Hierarchy traversal expansion budget exceeded".into());
            }
        }
        if height > MAX_GRAPH_DEPTH {
            return Err("Hierarchy is too deep".into());
        }
        active.remove(name);
        complete.insert(name, (height, expansion));
        Ok((height, expansion))
    }
    for name in edges.keys() {
        visit(name, &edges, &mut BTreeSet::new(), &mut complete, 0)?;
    }
    Ok(())
}
fn hierarchy(
    value: Option<&Value>,
    units: &BTreeSet<String>,
    budget: &mut Budget,
) -> Result<Nodes, String> {
    let mut nodes = Nodes::new();
    let Some(value) = value else {
        return Ok(nodes);
    };
    let value = object(value, "hierarchy")?;
    if let Some(raw) = value.get("nodes") {
        let raw = object(raw, "hierarchy.nodes")?;
        budget.entities(raw.len())?;
        for (key, raw) in raw {
            checked_id(key)?;
            let raw = object(raw, "hierarchy node")?;
            let name = raw.get("id").map(id).transpose()?.unwrap_or(key);
            // The Viewer allows explicit IDs; all references use that effective ID.
            let node_level = text(required(raw, "level")?, "level")?;
            level(node_level)?;
            entity(raw, budget)?;
            if let Some(status) = raw.get("status")
                && !matches!(text(status, "status")?, "active" | "destroyed")
            {
                return Err("Invalid hierarchy status".into());
            }
            if let Some(history) = raw.get("history") {
                array(history, "history")?;
            }
            if let Some(unit_ids) = raw.get("unitIds") {
                for unit in ids(unit_ids)? {
                    link(&unit, units)?;
                }
            }
            let node = Node {
                level: node_level.into(),
                parent: parent(raw.get("parentId"))?,
                children: raw
                    .get("childrenIds")
                    .map(ids)
                    .transpose()?
                    .unwrap_or_default(),
            };
            if nodes.insert(name.to_owned(), node).is_some() {
                return Err("Duplicate hierarchy id".into());
            }
        }
    } else if let Some(legions) = value.get("legions") {
        fn legacy(
            value: &Value,
            parent: Option<&str>,
            depth: usize,
            nodes: &mut Nodes,
            units: &BTreeSet<String>,
            budget: &mut Budget,
        ) -> Result<String, String> {
            if depth > MAX_GRAPH_DEPTH {
                return Err("Legacy hierarchy is too deep".into());
            }
            budget.entities(1)?;
            let value = object(value, "legacy hierarchy")?;
            let name = id(required(value, "id")?)?.to_owned();
            entity(value, budget)?;
            if let Some(raw) = value.get("units") {
                for unit in ids(raw)? {
                    link(&unit, units)?;
                }
            }
            let node = Node {
                level: ["legion", "corps", "division", "regiment"][depth.min(3)].into(),
                parent: parent.map(str::to_owned),
                children: vec![],
            };
            if nodes.insert(name.clone(), node).is_some() {
                return Err("Duplicate hierarchy id".into());
            }
            let mut children = vec![];
            if let Some(raw) = value.get("children") {
                for child in array(raw, "children")? {
                    children.push(legacy(child, Some(&name), depth + 1, nodes, units, budget)?);
                }
            }
            nodes.get_mut(&name).unwrap().children = children;
            Ok(name)
        }
        for legion in array(legions, "legions")? {
            legacy(legion, None, 0, &mut nodes, units, budget)?;
        }
    }
    graph_valid(&nodes)?;
    if let Some(roots) = value.get("roots") {
        for root in ids(roots)? {
            if !nodes.contains_key(&root) {
                return Err("Unknown hierarchy root".into());
            }
        }
    }
    Ok(nodes)
}

fn timeline_table(
    value: &Value,
    known: &BTreeSet<String>,
    allow_new: bool,
    budget: &mut Budget,
) -> Result<(), String> {
    for (name, points) in object(value, "timeline collection")? {
        checked_id(name)?;
        if !allow_new {
            link(name, known)?;
        } else if !known.contains(name) {
            budget.entities(1)?;
        }
        timeline(points, false, budget)?;
    }
    Ok(())
}
fn change_parent(nodes: &mut Nodes, name: &str, new_parent: Option<String>) -> Result<(), String> {
    if let Some(parent) = &new_parent
        && !nodes.contains_key(parent)
    {
        return Err("Unknown event parent".into());
    }
    let previous = nodes
        .get(name)
        .ok_or("Unknown event target")?
        .parent
        .clone();
    if let Some(parent) = previous
        && let Some(node) = nodes.get_mut(&parent)
    {
        node.children.retain(|child| child != name);
    }
    nodes.get_mut(name).unwrap().parent = new_parent.clone();
    if let Some(parent) = new_parent {
        let children = &mut nodes.get_mut(&parent).unwrap().children;
        if !children.iter().any(|child| child == name) {
            children.push(name.into());
        }
    }
    Ok(())
}
fn events(value: &Value, original: &Nodes, units: &BTreeSet<String>) -> Result<(), String> {
    let values = array(value, "events")?;
    if values.len() > MAX_EVENTS {
        return Err("Too many events".into());
    }
    // Replaying graph mutations must not turn a small compressed input into an
    // unbounded amount of validation work.
    let mut remaining_graph_work = MAX_EVENT_GRAPH_WORK;
    let mut sorted = Vec::with_capacity(values.len());
    for value in values {
        let value = object(value, "event")?;
        let time = nonnegative(required(value, "t")?, "event.t")?;
        sorted.push((time, value));
    }
    sorted.sort_by(|a, b| a.0.total_cmp(&b.0));
    let mut nodes = original.clone();
    for (_, value) in sorted {
        let kind = text(required(value, "event")?, "event")?;
        let target = id(required(
            value,
            if matches!(kind, "detach" | "transfer") {
                "source"
            } else {
                "target"
            },
        )?)?;
        let node = nodes
            .get(target)
            .ok_or("Event refers to missing hierarchy node")?
            .clone();
        match kind {
            "status" => {
                if !matches!(
                    text(required(value, "status")?, "status")?,
                    "active" | "destroyed"
                ) {
                    return Err("Invalid event status".into());
                }
            }
            "destroyed" => {}
            "reparent" | "detach" | "transfer" => {
                let new_parent = match kind {
                    "detach" => None,
                    "transfer" => Some(id(required(value, "to")?)?.into()),
                    _ => parent(Some(required(value, "parent")?))?,
                };
                change_parent(&mut nodes, target, new_parent)?;
            }
            "merge" => {
                let source = id(required(value, "source")?)?;
                let source_node = nodes.get(source).ok_or("Unknown merge source")?.clone();
                if source == target || source_node.level != node.level {
                    return Err("Invalid merge".into());
                }
                change_parent(&mut nodes, source, None)?;
                for child in &source_node.children {
                    change_parent(&mut nodes, child, Some(target.into()))?;
                }
                nodes.remove(source);
                for value in nodes.values_mut() {
                    value.children.retain(|child| child != source);
                }
            }
            "reform" => {
                if value.contains_key("parent") {
                    change_parent(&mut nodes, target, parent(value.get("parent"))?)?;
                }
                if let Some(children) = value.get("children") {
                    let children = ids(children)?;
                    if node.level == "regiment" {
                        for unit in children {
                            link(&unit, units)?;
                        }
                    } else {
                        for child in &children {
                            if !nodes.contains_key(child) {
                                return Err("Unknown reform child".into());
                            }
                        }
                        nodes.get_mut(target).unwrap().children = children.clone();
                        for child in children {
                            nodes.get_mut(&child).unwrap().parent = Some(target.into());
                        }
                    }
                }
            }
            _ => return Err("Unsupported event kind".into()),
        }
        remaining_graph_work = remaining_graph_work
            .checked_sub(graph_work(&nodes))
            .ok_or("Event/hierarchy validation budget exceeded")?;
        graph_valid(&nodes)?;
    }
    Ok(())
}

fn creator(value: &Value, budget: &mut Budget) -> Result<(), String> {
    let value = object(value, "creatorState")?;
    if !matches!(required(value, "version")?.as_u64(), Some(1 | 2)) {
        return Err("Unsupported creatorState version".into());
    }
    if let Some(origin) = value.get("coordinateOrigin")
        && text(origin, "creatorState.coordinateOrigin")? != "center"
    {
        return Err("Creator coordinates must be center-based".into());
    }
    optional_number(value, "duration", false, 1)?;
    let items = array(required(value, "items")?, "creatorState.items")?;
    budget.entities(items.len())?;
    let mut keys = BTreeSet::new();
    let mut identities = BTreeSet::new();
    let mut nodes = Nodes::new();
    let mut parents = vec![];
    let mut origins = vec![];
    for value in items {
        let value = object(value, "Creator item")?;
        let kind = text(required(value, "type")?, "Creator item type")?;
        if !matches!(
            kind,
            "unit" | "character" | "camera" | "legion" | "corps" | "division" | "regiment"
        ) {
            return Err("Unsupported Creator item type".into());
        }
        let name = if kind == "camera" {
            value
                .get("id")
                .map(|v| text(v, "camera id"))
                .transpose()?
                .unwrap_or("")
        } else {
            id(required(value, "id")?)?.trim()
        };
        if kind != "camera" && !identities.insert((kind.to_owned(), name.to_owned())) {
            return Err("Duplicate Creator identity".into());
        }
        if let Some(key) = value.get("key")
            && !keys.insert(id(key)?.to_owned())
        {
            return Err("Duplicate Creator key".into());
        }
        string_fields(value, &["name", "description", "force", "color"])?;
        image_fields(value)?;
        boolean_fields(value, &["groupMove", "destroyEnabled"])?;
        for key in ["x", "y"] {
            optional_number(value, key, false, 0)?;
        }
        // JSON.stringify turns optional NaN values in current Creator state into null.
        optional_number(value, "dir", true, 0)?;
        let zoom = optional_number(value, "zoom", true, 2)?;
        if kind == "camera" && zoom.is_none() {
            return Err("Creator camera requires positive zoom".into());
        }
        let appear = optional_number(value, "appearAt", true, 1)?.unwrap_or(0.0);
        let destroy = optional_number(value, "destroyAt", true, 1)?;
        if value.get("destroyEnabled").and_then(Value::as_bool) == Some(true)
            && !destroy.is_some_and(|d| d >= appear)
        {
            return Err("Invalid Creator destroyAt".into());
        }
        if let Some(raw) = value.get("timeline") {
            timeline(raw, false, budget)?;
        }
        if let Some(raw) = value.get("groupMoveTimeline") {
            group_timeline(raw, budget)?;
        }
        let parent = match value.get("parentId") {
            None => None,
            Some(v) if v.as_str() == Some("") => None,
            Some(v) => Some(id(v)?.to_owned()),
        };
        if let Some(origin) = value.get("groupOrigin") {
            position(origin)?;
            origins.push(id(required(object(origin, "groupOrigin")?, "key")?)?.to_owned());
        }
        if matches!(kind, "legion" | "corps" | "division" | "regiment")
            && nodes
                .insert(
                    name.into(),
                    Node {
                        level: kind.into(),
                        parent: parent.clone(),
                        children: vec![],
                    },
                )
                .is_some()
        {
            return Err("Duplicate Creator hierarchy id".into());
        }
        if let Some(parent) = parent {
            parents.push((kind.to_owned(), parent));
        }
    }
    for (kind, parent) in parents {
        let parent = nodes.get(&parent).ok_or("Unknown Creator parent")?;
        let expected = match kind.as_str() {
            "corps" => "legion",
            "division" => "corps",
            "regiment" => "division",
            "unit" => "regiment",
            _ => return Err("This Creator item cannot have a parent".into()),
        };
        if parent.level != expected {
            return Err("Invalid Creator parent level".into());
        }
    }
    for origin in origins {
        if !keys.contains(&origin) {
            return Err("Unknown Creator groupOrigin key".into());
        }
    }
    graph_valid(&nodes)
}

/// Validate current Battle and Creator runtime inputs without projecting away data.
/// This is not image decoding, legal moderation, authorization or a license check.
pub fn validate_battle(document: &Value) -> Result<(), String> {
    let value = object(document, "Battle JSON")?;
    let mut budget = Budget::default();
    let map = object(required(value, "map")?, "map")?;
    positive(required(map, "width")?, "map.width")?;
    positive(required(map, "height")?, "map.height")?;
    if let Some(origin) = map.get("coordinateOrigin")
        && !matches!(text(origin, "coordinateOrigin")?, "top-left" | "center")
    {
        return Err("Invalid coordinateOrigin".into());
    }
    image_fields(map)?;
    string_fields(value, &["title"])?;
    if let Some(meta) = value.get("meta") {
        let meta = object(meta, "meta")?;
        string_fields(meta, &["title"])?;
        optional_number(meta, "duration", false, 1)?;
    }
    let units = definitions(value.get("units"), &mut budget)?;
    let characters = definitions(value.get("characters"), &mut budget)?;
    let nodes = hierarchy(value.get("hierarchy"), &units, &mut budget)?;
    let node_ids = nodes.keys().cloned().collect();
    if let Some(raw) = value.get("timeline") {
        let raw = object(raw, "timeline")?;
        for (kind, known, allow_new) in [
            ("units", &units, false),
            ("characters", &characters, true),
            ("hierarchy", &node_ids, false),
        ] {
            if let Some(table) = raw.get(kind) {
                timeline_table(table, known, allow_new, &mut budget)?;
            }
        }
        if let Some(camera) = raw.get("camera") {
            timeline(camera, true, &mut budget)?;
        }
    }
    if let Some(camera) = value.get("camera") {
        timeline(camera, true, &mut budget)?;
    }
    if let Some(raw) = value.get("events") {
        events(raw, &nodes, &units)?;
    }
    if let Some(raw) = value.get("creatorState") {
        creator(raw, &mut budget)?;
    }
    if let Some(raw) = value.get("forces") {
        let raw = array(raw, "forces")?;
        budget.entities(raw.len())?;
        for force in raw {
            let force = object(force, "force")?;
            id(required(force, "name")?)?;
            let color = text(required(force, "color")?, "force.color")?;
            if color.len() != 7
                || !color.starts_with('#')
                || !color.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
            {
                return Err("Invalid force color".into());
            }
        }
    }
    if let Some(raw) = value.get("lod") {
        let raw = object(raw, "lod")?;
        optional_number(raw, "fadeRange", false, 1)?;
        for key in ["legion", "corps", "division", "regiment", "unit"] {
            if let Some(band) = raw.get(key) {
                let band = object(band, "lod band")?;
                optional_number(band, "min", false, 1)?;
                optional_number(band, "max", false, 1)?;
            }
        }
    }
    Ok(())
}
