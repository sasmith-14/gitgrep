export function metrics(ranking: string[], labels: Record<string, number>, k = 10) {
  const top = ranking.slice(0,k);
  const positives = Object.values(labels).filter(x=>x>0).length;
  const dcg = (grades: number[]) => grades.reduce((sum,grade,i)=>sum+(2**grade-1)/Math.log2(i+2),0);
  const ideal = dcg(Object.values(labels).sort((a,b)=>b-a).slice(0,k));
  const first = top.findIndex(id=>(labels[id] ?? 0)>0);
  return { ndcg: ideal ? dcg(top.map(id=>labels[id] ?? 0))/ideal : 0,
    mrr: first < 0 ? 0 : 1/(first+1), recall: positives ? top.filter(id=>(labels[id] ?? 0)>0).length/positives : 0 };
}
