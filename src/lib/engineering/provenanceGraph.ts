export type ProvenanceNodeType = "assessment" | "evidence" | "observation" | "asset-model" | "expectation" | "residual" | "diagnosis" | "intervention" | "simulation" | "economics" | "decision";
export interface ProvenanceNode { id:string; type:ProvenanceNodeType; label:string; detail?:string; confidence?:number; source?:string; }
export interface ProvenanceEdge { from:string; to:string; relation:"supports"|"measured-by"|"derived-from"|"compared-with"|"causes"|"simulates"|"values"; }
export interface DecisionProvenanceGraph { nodes:ProvenanceNode[]; edges:ProvenanceEdge[]; }
export interface ProvenanceExtraction { evidenceId?:string; evidenceType?:string; observations?:Array<{field:string; value:string; numericValue:number|null; unit:string|null; confidence:number; sourceText:string}>; }
export interface ProvenanceDecision { actionId?:string; actionLabel?:string; equation?:string; status?:string; annualEnergyDeltaKWh?:number|null; annualSavingINR?:number|null; }

function slug(v:string){return v.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");}

export function buildDecisionProvenanceGraph(input:{scope:"building"|"facility"|"equipment";assessmentLabel?:string;extracts:ProvenanceExtraction[];decision?:ProvenanceDecision|null}):DecisionProvenanceGraph{
 const nodes:ProvenanceNode[]=[]; const edges:ProvenanceEdge[]=[];
 const assessmentId="assessment:current", modelId="asset-model:current", expectationId="expectation:current", residualId="residual:current", diagnosisId="diagnosis:current", decisionId="decision:current";
 nodes.push({id:assessmentId,type:"assessment",label:input.assessmentLabel||`${input.scope} assessment`,detail:input.scope});
 nodes.push({id:modelId,type:"asset-model",label:"Normalized asset model",detail:"Structured representation consumed by engineering calculations."});
 edges.push({from:modelId,to:assessmentId,relation:"derived-from"});
 let index=0;
 for(const extract of input.extracts){
  const evidenceId=`evidence:${slug(extract.evidenceId||`source-${index}`)}`;
  nodes.push({id:evidenceId,type:"evidence",label:extract.evidenceId||"Evidence source",detail:extract.evidenceType||"unclassified",source:extract.evidenceType});
  edges.push({from:evidenceId,to:assessmentId,relation:"supports"});
  for(const o of extract.observations||[]){
   const id=`observation:${index++}`; const value=o.numericValue!=null&&Number.isFinite(o.numericValue)?`${o.numericValue} ${o.unit||""}`.trim():o.value;
   nodes.push({id,type:"observation",label:o.field,detail:value,confidence:o.confidence,source:o.sourceText});
   edges.push({from:id,to:evidenceId,relation:"measured-by"}); edges.push({from:id,to:modelId,relation:"supports"});
  }
 }
 nodes.push({id:expectationId,type:"expectation",label:"Independent healthy expectation",detail:"Physics, manufacturer reference, calibrated model, or trained surrogate."});
 edges.push({from:expectationId,to:modelId,relation:"derived-from"});
 nodes.push({id:residualId,type:"residual",label:"Observed vs expected residual",detail:"Comparable observed signals are tested against an independent expectation."});
 edges.push({from:modelId,to:residualId,relation:"supports"},{from:expectationId,to:residualId,relation:"compared-with"});
 nodes.push({id:diagnosisId,type:"diagnosis",label:"Deterministic diagnosis",detail:"Residual pattern → cause candidates → discriminating evidence."});
 edges.push({from:residualId,to:diagnosisId,relation:"causes"});
 if(input.decision){
  const interventionId=`intervention:${slug(input.decision.actionId||"selected")}`;
  const simulationId=`simulation:${slug(input.decision.actionId||"selected")}`;
  nodes.push({id:interventionId,type:"intervention",label:input.decision.actionLabel||input.decision.actionId||"Selected intervention",detail:input.decision.status||"pending"});
  nodes.push({id:simulationId,type:"simulation",label:"Deterministic intervention simulation",detail:input.decision.equation||"Engineering equation not supplied."});
  nodes.push({id:decisionId,type:"decision",label:"Current decision state",detail:input.decision.status||"pending evidence"});
  edges.push({from:diagnosisId,to:interventionId,relation:"supports"},{from:interventionId,to:simulationId,relation:"simulates"},{from:simulationId,to:decisionId,relation:"supports"});
  if(input.decision.annualEnergyDeltaKWh!=null||input.decision.annualSavingINR!=null){
   const economicsId=`economics:${slug(input.decision.actionId||"selected")}`;
   nodes.push({id:economicsId,type:"economics",label:"Decision economics",detail:[input.decision.annualEnergyDeltaKWh!=null?`ΔE ${input.decision.annualEnergyDeltaKWh.toFixed(0)} kWh/yr`:null,input.decision.annualSavingINR!=null?`saving ₹${Math.round(input.decision.annualSavingINR).toLocaleString("en-IN")}/yr`:null].filter(Boolean).join(" · ")});
   edges.push({from:simulationId,to:economicsId,relation:"values"},{from:economicsId,to:decisionId,relation:"supports"});
  }
 }
 return {nodes,edges};
}
