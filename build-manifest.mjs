import fs from 'node:fs/promises';
import path from 'node:path';

const SRC = process.argv[2] || '/tmp/opencode/out-final/manifest.json';
const OUT = process.argv[3] || 'artworks/manifest.json';

const ACTS = [
  { id:'01-sacre',      title:'I. Le Sacré',      emotion:'La peur',           color:'#6d5bd0', description:'L’homme se mesure à l’invisible : le ciel se déchire, les corps se relèvent.' },
  { id:'02-amour',      title:'II. L’Amour',      emotion:'Le désir',          color:'#d16b9a', description:'Le regard se perd dans un autre regard ; la chair devient promesse.' },
  { id:'03-pouvoir',    title:'III. Le Pouvoir',  emotion:'L’orgueil',         color:'#c8a24a', description:'Les souverains se donnent en spectacle ; la gloire se construit en surface.' },
  { id:'04-revolte',    title:'IV. La Révolte',   emotion:'La colère',         color:'#c9503e', description:'La foule se lève, le pinceau devient un geste, l’ordre se fissure.' },
  { id:'05-guerre',     title:'V. La Guerre',     emotion:'L’effroi',          color:'#8d4b3a', description:'Les corps remplacent les héros ; la lumière n’éclaire plus que la ruine.' },
  { id:'06-deuil',      title:'VI. Le Deuil',     emotion:'La tristesse',      color:'#3f5a86', description:'On s’arrête devant l’absence ; le silence prend la place du récit.' },
  { id:'07-melancolie', title:'VII. La Mélancolie', emotion:'La nostalgie',    color:'#6f8196', description:'Une fenêtre, une chambre, un ciel gris : le temps ralentit jusqu’à s’arrêter.' },
  { id:'08-reve',       title:'VIII. Le Rêve',    emotion:'L’émerveillement',  color:'#8a6fb5', description:'Les images libèrent leurs règles ; l’étrange devient une évidence.' },
  { id:'09-joie',       title:'IX. La Joie',      emotion:'La lumière',        color:'#d9a441', description:'L’été, la danse, l’eau : le bonheur se donne sans explication.' },
  { id:'10-sublime',    title:'X. Le Sublime',    emotion:'Le vertige',        color:'#9fb6c4', description:'La mer, la montagne, l’orage : le paysage devient une émotion sans visage.' }
];

const MAP = {
  '01-sacre': ['24-vocation','35-cene','37-ecole','38-adam','69-jugement-bosch','70-triomphe-mort','71-lamentation-giotto','72-christ-mort-mantegna','74-christ-mort-holbein'],
  '02-amour': ['06-perle','07-baiser','11-venus','39-printemps','43-arnolfini','48-odalisque','50-olympia','51-dejeuner','56-adele','76-judith-klimt','77-escarpolette','78-amour-sacre-profane','79-naissance-venus-bouguereau','80-beata-beatrix','82-venus-cabanel'],
  '03-pouvoir': ['09-joconde','13-ronde-nuit','33-anatomie','36-hermine','44-ambassadeurs','45-menines','55-madamex','66-persan','67-moghol','68-ottoman','83-sacre-napoleon','85-philippe-iv','86-louis-xiv','87-henri-viii','88-sardanapale'],
  '04-revolte': ['14-liberte','21-gauguin','47-marat','49-radeau','52-ornans','84-serment-horaces','90-bateliers-volga','91-wagon-troisieme'],
  '05-guerre': ['16-mai','73-saturne-goya','89-massacre-scio','94-apotheose-guerre','95-gassed','96-horreurs-guerre','97-execution-maximilien','98-jeune-martyre','99-pollice-verso'],
  '06-deuil': ['08-cri','23-ophelie','26-corbeaux','27-pommes','28-gachet','34-fils','53-angelus','57-mort','101-ile-morts','105-sorrow','109-vieil-homme'],
  '07-melancolie': ['01b-nuit-rhone','54-whistler','03-autoportrait','05-nympheas','15-voyageur','25-chambre','29-gare','32-delft','46-tolede','106-melencolia','107-moine-mer','108-melancholie-munch','110-interieur-hammershoi'],
  '08-reve': ['01-nuit-etoilee','22-rousseau','40-jardin','42-babel','58-composition','59-carre','112-cauchemar','113-reve-rousseau','114-cyclope-redon','115-ancient-days'],
  '09-joie': ['02-tournesols','18-baigneuses','31-laitiere','12-grande-jatte','19-moulin','20-danse','30-ombrelle','41-chasseurs','60-joueurs','62-danse','64-shower','65-qingming','116-danse-noces','117-baignade-asnieres','118-bord-mer-sorolla'],
  '10-sublime': ['04-impression','10-vague','17-pluie','61-saintevictoire','63-fuji','121-temeraire','122-tempete-neige','123-chariot-foin','124-oxbow','125-sierra-nevada','126-averse-hiroshige']
};

const FOCUS = {
  '01-sacre':['regard','main','ciel','ombre'], '02-amour':['regard','main','corps','lumière'],
  '03-pouvoir':['regard','main','drapé','ombre'], '04-revolte':['poing','regard','corps','ciel'],
  '05-guerre':['regard','corps','ombre','main'], '06-deuil':['visage','main','regard','ombre'],
  '07-melancolie':['fenêtre','regard','main','horizon'], '08-reve':['lumière','regard','main','ombre'],
  '09-joie':['corps','regard','main','lumière'], '10-sublime':['horizon','regard','ciel','main']
};

const era = year => {
  const n = Number(String(year||'').match(/\d{3,4}/)?.[0] || 0);
  if (!n) return 'époque à vérifier';
  if (n < 1500) return 'Fin du Moyen Âge · Renaissance naissante';
  if (n < 1700) return 'Renaissance · Baroque';
  if (n < 1850) return 'Lumières · Romantisme';
  if (n < 1900) return 'Modernité naissante';
  return 'XXe siècle';
};

const src = JSON.parse(await fs.readFile(SRC,'utf8'));
const byId = new Map(src.artworks.map(a => [a.id,a]));
const assigned = Object.values(MAP).flat();
const missing = assigned.filter(id => !byId.has(id));
const unassigned = src.artworks.map(a=>a.id).filter(id => !assigned.includes(id));
const dupes = assigned.filter((id,i) => assigned.indexOf(id)!==i);
if (missing.length || unassigned.length || dupes.length) {
  console.error({missing,unassigned,dupes}); process.exit(1);
}

const artworks = [];
for (const act of ACTS) {
  for (const [i,id] of MAP[act.id].entries()) {
    const a = byId.get(id);
    artworks.push({
      ...a,
      act: act.id,
      actTitle: act.title,
      emotion: act.emotion,
      color: act.color,
      era: era(a.year),
      story: a.narrative,
      order: i+1,
      detailFocus: FOCUS[act.id][i % FOCUS[act.id].length],
      dominantColor: a.dominant || [0,0,0]
    });
  }
}

const manifest = {
  schema: 'voie-lactee/manifest/v3',
  generator: 'build-manifest.mjs',
  version: 3,
  generatedAt: new Date().toISOString(),
  notice: 'Uniquement des œuvres du domaine public ou CC0. Vérifiez les droits locaux avant publication.',
  count: artworks.length,
  acts: ACTS.map(a => ({ ...a, count: MAP[a.id].length })),
  artworks
};
await fs.mkdir(path.dirname(OUT),{recursive:true});
await fs.writeFile(OUT, JSON.stringify(manifest,null,2)+'\n');
console.log(`manifest v3 : ${artworks.length} œuvres · ${ACTS.length} actes · ${artworks.filter(a=>a.verified).length} vérifiées → ${OUT}`);
