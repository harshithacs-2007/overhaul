export interface PortfolioOption { id: string; name: string; capexINR: number; annualSavingINR: number; annualEnergySavingKWh?: number; carbonSavingKgPerYear?: number; downtimeHours?: number; priorityWeight?: number; }
export interface PortfolioConstraints { budgetINR?: number; maxDowntimeHours?: number; minAnnualSavingINR?: number; carbonTargetKgPerYear?: number; maxActions?: number; }
export interface PortfolioResult { selected: PortfolioOption[]; rejected: Array<{ option: PortfolioOption; reason: string }>; totalCapexINR: number; totalAnnualSavingINR: number; totalAnnualEnergySavingKWh: number; totalCarbonSavingKgPerYear: number; totalDowntimeHours: number; score: number; }
const n=(v:number|undefined)=>typeof v==='number'&&Number.isFinite(v)?v:0;
const s=(o:PortfolioOption)=>((Math.max(n(o.annualSavingINR),0)+Math.max(n(o.carbonSavingKgPerYear),0)*0.2)/Math.max(n(o.capexINR),1))*Math.max(n(o.priorityWeight),1);
export function optimizeRetrofitPortfolio(options:PortfolioOption[], c:PortfolioConstraints={}):PortfolioResult {
 const selected:PortfolioOption[]=[]; const rejected:PortfolioResult['rejected']=[]; let capex=0,savings=0,energy=0,carbon=0,downtime=0;
 for(const o of [...options].sort((a,b)=>s(b)-s(a))){const oc=Math.max(n(o.capexINR),0),od=Math.max(n(o.downtimeHours),0);
  if(c.maxActions!=null&&selected.length>=c.maxActions){rejected.push({option:o,reason:'maximum actions reached'});continue;}
  if(c.budgetINR!=null&&capex+oc>c.budgetINR){rejected.push({option:o,reason:'budget constraint'});continue;}
  if(c.maxDowntimeHours!=null&&downtime+od>c.maxDowntimeHours){rejected.push({option:o,reason:'downtime constraint'});continue;}
  selected.push(o);capex+=oc;savings+=n(o.annualSavingINR);energy+=n(o.annualEnergySavingKWh);carbon+=n(o.carbonSavingKgPerYear);downtime+=od;
 }
 return {selected,rejected,totalCapexINR:capex,totalAnnualSavingINR:savings,totalAnnualEnergySavingKWh:energy,totalCarbonSavingKgPerYear:carbon,totalDowntimeHours:downtime,score:selected.reduce((a,o)=>a+s(o),0)};
}
