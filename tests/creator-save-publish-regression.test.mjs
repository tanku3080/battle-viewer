import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

function loadTs(relative) {
  const source = fs.readFileSync(relative, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }}).outputText;
  const compiled = { exports: {} };
  new Function("exports", "module", output)(compiled.exports, compiled);
  return compiled.exports;
}
const { exportCreatorCoordinate } = loadTs("utils/battleCreator/export.ts");
const { validatePublishBattle } = loadTs("utils/battleHub/validatePublish.ts");

const valid = () => ({
  title: "意味無し", map: {width:1200,height:700,coordinateOrigin:"center"},
  units:[{id:"あああああ",name:"unit1",icon:null}],
  creatorState:{version:2,coordinateOrigin:"center",duration:60,items:[
    {key:"2d82ad31-9289-4701-a29c-ca2be0af9cbf",type:"unit",id:"あああああ",name:"unit1",
    description:"",force:"",color:"",icon:"",parentId:"",groupMove:false,x:null,y:109,zoom:null,dir:null,appearAt:0,
    destroyEnabled:false,destroyAt:null,timeline:[{t:0,x:-132,y:109,explicit:false,inherited:false},
    {t:14.3,x:-1,y:109,explicit:true,inherited:false}]}
  ]},
  timeline:{units:{"あああああ":[{t:0,x:-132,y:109},{t:14.3,x:-1,y:109}]}}
});

test("regression: Creator raw JSON with null x is rejected before publication", () => {
  assert.throws(() => validatePublishBattle(valid()), /creatorState.*\.x must be finite/);
});
test("Creator export recovers x from original timeline and validates", () => {
  const battle = valid();
  const unit = battle.creatorState.items[0];
  unit.x = exportCreatorCoordinate(Number.NaN, unit.timeline, "x");
  assert.equal(unit.x, -132);
  assert.equal(validatePublishBattle(battle).title, "意味無し");
  assert.equal(unit.timeline[1].x, -1);
});
test("missing position with no valid timeline remains invalid rather than inventing coordinates", () => {
  assert.equal(exportCreatorCoordinate(Number.NaN, [], "x"), null);
});
test("Creator save and publish present localized feedback", () => {
  const creator = fs.readFileSync("app/create/page.tsx", "utf8");
  const dialog = fs.readFileSync("components/p2p/PublishWorkDialog.tsx", "utf8");
  const controls = fs.readFileSync("components/battle/controls/BattleHubControls.tsx", "utf8");
  assert.match(creator, /validatePublishBattle\(battleJson\)/);
  assert.match(creator, /creator\.saveStarted/);
  assert.match(dialog, /explainPublishError/);
  assert.equal((controls.match(/<BattleHubAccessButton\b/g) ?? []).length, 1); // only one rendered button
});
