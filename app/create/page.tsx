"use client";

import Link from "next/link";
import { DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { getCreatorPositionAt } from "@/utils/battleCreator/timeline";

type SpatialType = "unit" | "character" | "legion" | "corps" | "division" | "regiment" | "camera";
type EventType = "status" | "reparent" | "merge" | "reform";
type PaletteType = SpatialType | EventType;
type Point = { t: number; x: number; y: number; dir?: number };
type EditorItem = { key:string; type:SpatialType; id:string; name:string; force:string; color:string; icon:string; parentId:string; children:string; x:number; y:number; zoom:number; dir:number; timeline:Point[] };
type EditorEvent = { key:string; type:EventType; t:number; target:string; source:string; parent:string; status:string; children:string };

const PALETTE: Array<{type:PaletteType;label:string;mark:string;tooltip:string;draggable:boolean}> = [
  {type:"unit",label:"Unit",mark:"●",tooltip:"兵士・車両・航空機など、timelineで移動する最小戦闘単位を配置します。",draggable:true},
  {type:"character",label:"Character",mark:"◆",tooltip:"指揮官など、軍事階層に属さない独立キャラクターを配置します。",draggable:true},
  {type:"legion",label:"Legion",mark:"L",tooltip:"戦場全体を束ねる最上位の軍勢を配置します。",draggable:true},
  {type:"corps",label:"Corps",mark:"C",tooltip:"Legion配下の軍団を配置します。",draggable:true},
  {type:"division",label:"Division",mark:"D",tooltip:"Corps配下の師団を配置します。",draggable:true},
  {type:"regiment",label:"Regiment",mark:"R",tooltip:"Division配下でUnitを束ねる連隊を配置します。",draggable:true},
  {type:"camera",label:"Camera",mark:"◎",tooltip:"現在時刻のカメラ中心座標とズーム値を記録します。",draggable:true},
  {type:"status",label:"Status",mark:"S",tooltip:"対象階層をactive / destroyedへ変更します。",draggable:false},
  {type:"reparent",label:"Reparent",mark:"↪",tooltip:"対象階層の親を変更します。空欄なら離脱です。",draggable:false},
  {type:"merge",label:"Merge",mark:"M",tooltip:"同階層sourceをtargetへ吸収します。",draggable:false},
  {type:"reform",label:"Reform",mark:"↻",tooltip:"親またはchildren / unitIdsを再編します。",draggable:false},
];

function isEventType(type: PaletteType): type is EventType { return ["status","reparent","merge","reform"].includes(type); }
function isHierarchy(type: SpatialType) { return ["legion","corps","division","regiment"].includes(type); }
function emptyItem(type: SpatialType): EditorItem { return {key:crypto.randomUUID(),type,id:"",name:"",force:"",color:"",icon:"",parentId:"",children:"",x:Number.NaN,y:Number.NaN,zoom:Number.NaN,dir:Number.NaN,timeline:[]}; }
function emptyEvent(type: EventType, t:number): EditorEvent { return {key:crypto.randomUUID(),type,t,target:"",source:"",parent:"",status:"",children:""}; }

export default function BattleCreator() {
  const editorRef = useRef<HTMLDivElement|null>(null);
  const [paletteOpen,setPaletteOpen] = useState(true);
  const [title,setTitle] = useState("");
  const [mapImage,setMapImage] = useState("");
  const [mapWidth,setMapWidth] = useState(1200);
  const [mapHeight,setMapHeight] = useState(700);
  const [duration,setDuration] = useState(60);
  const [currentTime,setCurrentTime] = useState(0);
  const [isPlaying,setIsPlaying] = useState(false);
  const [items,setItems] = useState<EditorItem[]>([]);
  const [events,setEvents] = useState<EditorEvent[]>([]);
  const [selectedKey,setSelectedKey] = useState<string|null>(null);
  const [draftItem,setDraftItem] = useState<EditorItem|null>(null);
  const [draftEvent,setDraftEvent] = useState<EditorEvent|null>(null);
  const [jsonOpen,setJsonOpen] = useState(false);
  const selectedSource = items.find((item)=>item.key===selectedKey) ?? draftItem ?? null;
  const selected = selectedSource && selectedKey && !isHierarchy(selectedSource.type)
    ? {
        ...selectedSource,
        ...getCreatorPositionAt(
          selectedSource.timeline,
          currentTime,
          { x:selectedSource.x, y:selectedSource.y }
        ),
      }
    : selectedSource;

  const toLogical = (clientX:number,clientY:number) => {
    const rect = editorRef.current?.getBoundingClientRect();
    if (!rect) return {x:0,y:0};
    const rx = ((clientX-rect.left)/rect.width)*mapWidth;
    const ry = ((clientY-rect.top)/rect.height)*mapHeight;
    return {x:Math.round(rx-mapWidth/2),y:Math.round(mapHeight/2-ry)};
  };
  const toPercent = (x:number,y:number) => {
    const ix = x+mapWidth/2;
    const iy = mapHeight/2-y;
    return {left:String((ix/mapWidth)*100)+"%",top:String((iy/mapHeight)*100)+"%"};
  };
  useEffect(() => {
    if (!isPlaying) return;

    let frame = 0;
    let previous = performance.now();

    const tick = (now:number) => {
      const delta = (now - previous) / 1000;
      previous = now;

      setCurrentTime((value) => {
        const next = value + delta;
        if (next >= duration) {
          setIsPlaying(false);
          return duration;
        }
        return next;
      });

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration,isPlaying]);

  const selectPalette = (type:PaletteType) => {
    setSelectedKey(null);
    if (isEventType(type)) { setDraftItem(null); setDraftEvent(emptyEvent(type,currentTime)); }
    else { setDraftEvent(null); setDraftItem(emptyItem(type)); }
  };
  const paletteDrag = (event:DragEvent<HTMLButtonElement>,type:PaletteType) => {
    if (isEventType(type)) return;
    event.dataTransfer.setData("application/x-battle-palette",type);
    event.dataTransfer.effectAllowed="copy";
    if (!draftItem || draftItem.type !== type) selectPalette(type);
  };
  const record = (item:EditorItem,x:number,y:number) => {
    if (isHierarchy(item.type)) return {...item,x,y};
    const point: Point = {t:currentTime,x,y,...(Number.isFinite(item.dir)?{dir:item.dir}:{})};
    const timeline=[...item.timeline.filter((p)=>p.t!==currentTime),point].sort((a,b)=>a.t-b.t);
    return {...item,x,y,zoom:item.type==="camera"&&!Number.isFinite(item.zoom)?1:item.zoom,timeline};
  };
  const drop = (event:DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const type=event.dataTransfer.getData("application/x-battle-palette") as SpatialType;
    const moveKey=event.dataTransfer.getData("application/x-battle-item");
    const p=toLogical(event.clientX,event.clientY);
    if (moveKey) { setItems((old)=>old.map((item)=>item.key===moveKey?record(item,p.x,p.y):item)); setSelectedKey(moveKey); setDraftItem(null); return; }
    if (!type) return;
    const base=draftItem && draftItem.type===type ? draftItem : emptyItem(type);
    const created=record({...base,key:crypto.randomUUID()},p.x,p.y);
    setItems((old)=>[...old,created]); setSelectedKey(created.key); setDraftItem(null); setDraftEvent(null);
  };
  const itemDrag=(event:DragEvent<HTMLButtonElement>,key:string)=>{event.dataTransfer.setData("application/x-battle-item",key);event.dataTransfer.effectAllowed="move";setSelectedKey(key);setDraftItem(null);setDraftEvent(null);};
  const updateSelected=(patch:Partial<EditorItem>)=>{
    if(selectedKey){setItems((old)=>old.map((item)=>item.key===selectedKey?{...item,...patch}:item));}
    else if(draftItem){setDraftItem({...draftItem,...patch});}
  };
  const addEvent=()=>{if(!draftEvent)return;setEvents((old)=>[...old,{...draftEvent,key:crypto.randomUUID(),t:currentTime}]);setDraftEvent(emptyEvent(draftEvent.type,currentTime));};

  const battleJson=useMemo(()=>{
    const units=items.filter((i)=>i.type==="unit"&&i.id.trim()).map((i)=>({id:i.id.trim(),...(i.force.trim()?{force:i.force.trim()}:{}),...(i.name.trim()?{name:i.name.trim()}:{}),...(i.color.trim()?{color:i.color.trim()}:{}),icon:i.icon.trim()||null}));
    const characters=items.filter((i)=>i.type==="character"&&i.id.trim()).map((i)=>({id:i.id.trim(),...(i.name.trim()?{name:i.name.trim()}:{}),icon:i.icon.trim()||null}));
    const h=items.filter((i)=>isHierarchy(i.type)&&i.id.trim());
    const nodes=Object.fromEntries(h.map((i)=>[i.id.trim(),{level:i.type,name:i.name.trim()||i.id.trim(),parentId:i.parentId.trim()||null,childrenIds:i.type==="regiment"?[]:i.children.split(",").map((v)=>v.trim()).filter(Boolean),unitIds:i.type==="regiment"?i.children.split(",").map((v)=>v.trim()).filter(Boolean):[],pos:{x:i.x,y:i.y}}]));
    const unitTimeline=Object.fromEntries(items.filter((i)=>i.type==="unit"&&i.id.trim()&&i.timeline.length).map((i)=>[i.id.trim(),i.timeline]));
    const charTimeline=Object.fromEntries(items.filter((i)=>i.type==="character"&&i.id.trim()&&i.timeline.length).map((i)=>[i.id.trim(),i.timeline]));
    const camera=items.filter((i)=>i.type==="camera").flatMap((i)=>i.timeline.map((p)=>({t:p.t,x:p.x,y:p.y,zoom:i.zoom}))).sort((a,b)=>a.t-b.t);
    const jsonEvents=events.flatMap<Record<string, unknown>>((e)=>{
      if(e.type==="status"&&e.target&&e.status)return[{t:e.t,event:"status",target:e.target,status:e.status}];
      if(e.type==="reparent"&&e.target)return[{t:e.t,event:"reparent",target:e.target,parent:e.parent||null}];
      if(e.type==="merge"&&e.source&&e.target)return[{t:e.t,event:"merge",source:e.source,target:e.target}];
      if(e.type==="reform"&&e.target)return[{t:e.t,event:"reform",target:e.target,...(e.parent?{parent:e.parent}:{}),...(e.children?{children:e.children.split(",").map((v)=>v.trim()).filter(Boolean)}:{})}];
      return[];
    });
    return {title,map:{...(mapImage.trim()?{image:mapImage.trim()}:{}),width:mapWidth,height:mapHeight,coordinateOrigin:"center"},...(Object.keys(nodes).length?{hierarchy:{nodes}}:{}),units,...(characters.length?{characters}:{}),...(jsonEvents.length?{events:jsonEvents}:{}),timeline:{...(camera.length?{camera}:{}),units:unitTimeline,...(Object.keys(charTimeline).length?{characters:charTimeline}:{})}};
  },[events,items,mapHeight,mapImage,mapWidth,title]);

  const saveJson=()=>{const blob=new Blob([JSON.stringify(battleJson,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=(title.trim()||"battle")+".json";a.click();URL.revokeObjectURL(url);};

  return <main className="h-screen bg-[#050816] text-gray-100 flex flex-col overflow-hidden">
    <header className="h-16 shrink-0 border-b border-gray-700 bg-[#0b1020] flex items-center gap-3 px-4">
      <Link href="/home" className="px-3 py-2 rounded bg-gray-700">戻る</Link>
      <input value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="戦闘名" className="w-52 rounded border border-gray-600 bg-[#111827] px-3 py-2"/>
      <input value={mapImage} onChange={(e)=>setMapImage(e.target.value)} placeholder="map.image（任意）" className="w-56 rounded border border-gray-600 bg-[#111827] px-3 py-2"/>
      <input type="number" min={1} value={mapWidth} onChange={(e)=>setMapWidth(Math.max(1,Number(e.target.value)))} title="map.width" className="w-24 rounded border border-gray-600 bg-[#111827] px-2 py-2"/><input type="number" min={1} value={mapHeight} onChange={(e)=>setMapHeight(Math.max(1,Number(e.target.value)))} title="map.height" className="w-24 rounded border border-gray-600 bg-[#111827] px-2 py-2"/><span className="rounded border border-gray-700 bg-[#111827] px-3 py-2 text-xs text-gray-300">原点: center / 上方向 +Y</span>
      <button onClick={()=>setJsonOpen((v)=>!v)} className="ml-auto px-3 py-2 rounded bg-slate-600">JSON確認</button>
      <button onClick={saveJson} className="px-3 py-2 rounded bg-emerald-600">JSON保存</button>
    </header>
    <div className="flex-1 min-h-0 flex">
      <aside className={"border-r border-gray-700 bg-[#0b1020] transition-all "+(paletteOpen?"w-64":"w-12")}>
        <button onClick={()=>setPaletteOpen((v)=>!v)} className="w-full h-10 border-b border-gray-700">{paletteOpen?"要素パレット ◀":"▶"}</button>
        {paletteOpen&&<div className="p-3 grid grid-cols-2 gap-2 overflow-y-auto max-h-[calc(100vh-11rem)]">{PALETTE.map((p)=><button key={p.type} draggable={p.draggable} onDragStart={(e)=>paletteDrag(e,p.type)} onClick={()=>selectPalette(p.type)} title={p.tooltip} className="min-h-20 rounded-lg border border-gray-700 bg-[#111827] hover:border-blue-400 p-2 text-left"><span className="block text-2xl font-bold">{p.mark}</span><span className="text-xs">{p.label}</span></button>)}</div>}
      </aside>
      <section className="flex-1 min-w-0 flex flex-col">
        <div ref={editorRef} onDragOver={(e)=>e.preventDefault()} onDrop={drop} className="relative flex-1 m-4 overflow-hidden border border-gray-600 bg-[#0a1020]" style={{backgroundImage:"linear-gradient(rgba(255,255,255,.09) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.09) 1px, transparent 1px)",backgroundSize:"50px 50px"}}>
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-yellow-400/80"/><div className="absolute top-1/2 left-0 right-0 h-px bg-yellow-400/80"/><div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] text-yellow-300 bg-black/60 px-1">(0,0)</div>
          {items.map((item)=>{const current=isHierarchy(item.type)?{x:item.x,y:item.y}:getCreatorPositionAt(item.timeline,currentTime,{x:item.x,y:item.y});const pos=toPercent(current.x,current.y);const mark=PALETTE.find((p)=>p.type===item.type)?.mark??"?";return <button key={item.key} draggable onDragStart={(e)=>itemDrag(e,item.key)} onClick={()=>{setSelectedKey(item.key);setDraftItem(null);setDraftEvent(null);}} className={"absolute -translate-x-1/2 -translate-y-1/2 min-w-9 h-9 rounded-full border-2 font-bold "+(selectedKey===item.key?"border-yellow-300 bg-blue-600":"border-white/70 bg-slate-700")} style={pos} title={item.type+" "+(item.id||"(ID未設定)")+" @ "+current.x.toFixed(1)+","+current.y.toFixed(1)}>{mark}</button>;})}
        </div>
        <div className="shrink-0 border-t border-gray-700 bg-[#111827] px-5 py-3"><div className="flex items-center gap-3"><button type="button" onClick={()=>{if(currentTime>=duration)setCurrentTime(0);setIsPlaying(true);}} className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700">再生</button><button type="button" onClick={()=>setIsPlaying(false)} className="px-3 py-1 rounded bg-gray-600 hover:bg-gray-500">ストップ</button><span className="w-20 text-sm">{currentTime.toFixed(1)}s</span><input type="range" min={0} max={duration} step={0.1} value={currentTime} onChange={(e)=>{setIsPlaying(false);setCurrentTime(Number(e.target.value));}} className="flex-1"/><label className="text-xs flex items-center gap-2">最大秒数<input type="number" min={1} value={duration} onChange={(e)=>setDuration(Math.max(1,Number(e.target.value)))} className="w-20 rounded border border-gray-600 bg-[#0b1020] px-2 py-1"/></label></div><p className="mt-1 text-xs text-gray-400">シーク後に配置済みUnit / Character / CameraをD&Dすると、その時刻の座標を記録します。シークを戻すと記録済みtimeline位置へ復元されます。</p></div>
      </section>
      <aside className="w-80 shrink-0 border-l border-gray-700 bg-[#0b1020] overflow-y-auto">
        {draftEvent?<EventProperties event={draftEvent} currentTime={currentTime} onChange={(patch)=>setDraftEvent({...draftEvent,...patch})} onAdd={addEvent}/>:selected?<ItemProperties item={selected} placed={Boolean(selectedKey)} currentTime={currentTime} onChange={updateSelected}/>:null}
        {events.length>0&&<div className="border-t border-gray-700 p-4"><h3 className="font-semibold text-sm mb-2">登録イベント ({events.length})</h3>{events.map((e)=><div key={e.key} className="text-xs text-gray-400">{e.t.toFixed(1)}s : {e.type}</div>)}</div>}
      </aside>
    </div>
    {jsonOpen&&<div className="fixed inset-0 z-50 bg-black/70 p-8 flex items-center justify-center"><div className="w-full max-w-4xl max-h-full flex flex-col rounded-xl border border-gray-700 bg-[#0b1020]"><div className="flex items-center border-b border-gray-700 p-3"><strong>生成JSON</strong><button className="ml-auto px-3 py-1 rounded bg-gray-700" onClick={()=>setJsonOpen(false)}>閉じる</button></div><pre className="overflow-auto p-4 text-xs">{JSON.stringify(battleJson,null,2)}</pre></div></div>}
  </main>;
}

function Field({label,value,onChange,type="text"}:{label:string;value:string|number;onChange:(value:string)=>void;type?:string}){return <label className="block mb-3"><span className="block text-xs text-gray-400 mb-1">{label}</span><input type={type} value={value} onChange={(e)=>onChange(e.target.value)} className="w-full rounded border border-gray-600 bg-[#111827] px-3 py-2 text-sm"/></label>;}

function ItemProperties({item,placed,currentTime,onChange}:{item:EditorItem;placed:boolean;currentTime:number;onChange:(patch:Partial<EditorItem>)=>void}){return <div className="p-4"><h2 className="font-semibold mb-1">プロパティ</h2><p className="text-xs text-gray-500 mb-4">{item.type} / {placed?"配置済み":"未配置"}</p>{item.type!=="camera"&&<><Field label="id" value={item.id} onChange={(id)=>onChange({id})}/><Field label="name" value={item.name} onChange={(name)=>onChange({name})}/></>}{item.type==="unit"&&<><Field label="force" value={item.force} onChange={(force)=>onChange({force})}/><Field label="color" value={item.color} onChange={(color)=>onChange({color})}/><Field label="icon" value={item.icon} onChange={(icon)=>onChange({icon})}/></>}{item.type==="character"&&<Field label="icon" value={item.icon} onChange={(icon)=>onChange({icon})}/>} {(item.type==="unit"||item.type==="character")&&<Field label="dir（rad・任意）" type="number" value={Number.isFinite(item.dir)?item.dir:""} onChange={(dir)=>onChange({dir:dir===""?Number.NaN:Number(dir)})}/>} {isHierarchy(item.type)&&<><Field label="parentId" value={item.parentId} onChange={(parentId)=>onChange({parentId})}/><Field label={item.type==="regiment"?"unitIds（カンマ区切り）":"childrenIds（カンマ区切り）"} value={item.children} onChange={(children)=>onChange({children})}/></>}<Field label="x" type="number" value={Number.isFinite(item.x)?item.x:""} onChange={(x)=>onChange({x:x===""?Number.NaN:Number(x)})}/><Field label="y" type="number" value={Number.isFinite(item.y)?item.y:""} onChange={(y)=>onChange({y:y===""?Number.NaN:Number(y)})}/>{item.type==="camera"&&<Field label="zoom" type="number" value={Number.isFinite(item.zoom)?item.zoom:""} onChange={(zoom)=>onChange({zoom:zoom===""?Number.NaN:Number(zoom)})}/>}<div className="rounded border border-gray-700 bg-[#111827] p-3 text-xs">現在時刻: {currentTime.toFixed(1)}s<br/>記録済みkeyframe: {item.timeline.length}</div></div>;}

function EventProperties({event,currentTime,onChange,onAdd}:{event:EditorEvent;currentTime:number;onChange:(patch:Partial<EditorEvent>)=>void;onAdd:()=>void}){return <div className="p-4"><h2 className="font-semibold mb-1">イベントプロパティ</h2><p className="text-xs text-gray-500 mb-4">{event.type} / {currentTime.toFixed(1)}s</p>{event.type!=="merge"&&<Field label="target" value={event.target} onChange={(target)=>onChange({target})}/>} {event.type==="merge"&&<><Field label="source" value={event.source} onChange={(source)=>onChange({source})}/><Field label="target" value={event.target} onChange={(target)=>onChange({target})}/></>} {event.type==="status"&&<label className="block mb-3"><span className="block text-xs text-gray-400 mb-1">status</span><select value={event.status} onChange={(e)=>onChange({status:e.target.value})} className="w-full rounded border border-gray-600 bg-[#111827] px-3 py-2 text-sm"><option value="">未選択</option><option value="active">active</option><option value="destroyed">destroyed</option></select></label>} {(event.type==="reparent"||event.type==="reform")&&<Field label="parent" value={event.parent} onChange={(parent)=>onChange({parent})}/>} {event.type==="reform"&&<Field label="children（カンマ区切り）" value={event.children} onChange={(children)=>onChange({children})}/>}<button onClick={onAdd} className="w-full rounded bg-violet-600 py-2">現在時刻にイベント追加</button></div>;}
