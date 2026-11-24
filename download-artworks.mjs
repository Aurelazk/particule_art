#!/usr/bin/env node
/* Voie Lactée — téléchargeur vérifié, Node 18+, zéro dépendance npm.
   Usage : node download-artworks.mjs [--verify] [--probe] [--out artworks] */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ARGS = process.argv.slice(2);
const VERIFY = ARGS.includes('--verify');
const PROBE = ARGS.includes('--probe');
const ONLY_ARG = ARGS.find(a => a.startsWith('--only='));
const ONLY = ONLY_ARG ? new Set(ONLY_ARG.slice(7).split(',')) : null;
const OUT = ARGS.includes('--out') ? ARGS[ARGS.indexOf('--out') + 1] : 'artworks';
const UA = 'VoieLacteeGallery/2.0 (contact: aurel.local@example.org; téléchargements pédagogiques)';
const WD_UA = 'VoieLacteeGallery/2.0 (catalogage Wikidata; aurel.local@example.org)';
const MIN_DIM = 2000, TARGET_DIM = 3000, MAX_DIM = 4000;
const OPEN = /public domain|cc0|pd-old|pd-us|pd-art|no known copyright/i;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const words = s => (String(s).match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu) || []).length;
const strip = s => String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = s => new Set(norm(s).split(' ').filter(t => t.length > 2));
function dice(a, b) {
  const A = tokens(a), B = tokens(b); if (!A.size || !B.size) return 0;
  let n = 0; A.forEach(t => { if (B.has(t)) n++; }); return 2 * n / (A.size + B.size);
}
const surname = a => norm(a).split(' ').slice(-1)[0] || '';

/* Catalogue : chaque entrée est résolue d'abord dans Wikidata (P18 = fichier lié),
   puis sur Wikimedia Commons avec contrôle titre/artiste/musée. Aucune URL d'image n'est inventée. */
const CATALOG = [
  { id:'01-nuit-etoilee', qid:['Q45585'], title:'La Nuit étoilée', artist:'Vincent van Gogh', year:'1889', museum:'MoMA, New York', inventory:'472.1941', ratio:1.25, movement:'Post-impressionnisme', narrative:"Van Gogh peint cette nuit depuis sa chambre de Saint-Rémy : le ciel bouillonne, les étoiles pulsent, le cyprès monte comme une flamme noire." },
  { id:'01b-nuit-rhone', qid:['Q1464531'], title:'La Nuit étoilée sur le Rhône', artist:'Vincent van Gogh', year:'1888', museum:"Musée d'Orsay, Paris", inventory:'RF 1975 19', ratio:1.28, movement:'Post-impressionnisme', narrative:"Avant Saint-Rémy, Arles offre à Van Gogh une autre nuit : le fleuve, les lampes, le reflet des quais." },
  { id:'02-tournesols', qid:['Q21948567'], title:'Les Tournesols', artist:'Vincent van Gogh', year:'1888', museum:'National Gallery, Londres', inventory:'NG3862', ratio:0.77, movement:'Post-impressionnisme', narrative:"Des fleurs coupées, posées dans un vase, et pourtant tout brûle." },
  { id:'03-autoportrait', commons:'Van Gogh Self Portrait 1889', title:'Autoportrait', artist:'Vincent van Gogh', year:'1889', museum:"Musée d'Orsay, Paris", ratio:0.82, movement:'Post-impressionnisme', narrative:"Van Gogh se peint le regard perçant, les traits rongés par des touches courtes et tourmentées." },
  { id:'04-impression', qid:['Q328523'], title:'Impression, soleil levant', artist:'Claude Monet', year:'1872', museum:'Musée Marmottan Monet, Paris', ratio:1.48, movement:'Impressionnisme', narrative:"Le port du Havre à l'aube : quelques silhouettes de bateaux, des mâts à peine tracés, un soleil orange suspendu dans la brume." },
  { id:'05-nympheas', qid:['Q3877088','Q1189907'], aicId:16568, title:'Les Nymphéas', artist:'Claude Monet', year:'1916', museum:'Art Institute of Chicago', ratio:2.05, movement:'Impressionnisme', narrative:"La surface de l'étang devient un miroir où se confondent le ciel, les nuages et les feuilles flottantes." },
  { id:'06-perle', qid:['Q185372'], title:'La Jeune Fille à la perle', artist:'Johannes Vermeer', year:'c. 1665', museum:'Mauritshuis, La Haye', ratio:0.82, movement:"Âge d'or néerlandais", narrative:"Une jeune fille se tourne vers nous, lèvres entrouvertes, une perle accrochée à l'oreille." },
  { id:'07-baiser', qid:['Q698487'], title:'Le Baiser', artist:'Gustav Klimt', year:'1907–1908', museum:'Belvédère, Vienne', ratio:1, movement:'Jugendstil / Symbolisme', narrative:"Deux amants se fondent sous un manteau d'or, dans un baiser devenu icône." },
  { id:'08-cri', qid:['Q471379','Q18891158'], title:'Le Cri', artist:'Edvard Munch', year:'1893', museum:'Musée national, Oslo', ratio:0.8, movement:'Expressionnisme', narrative:"Un visage sans bouche hurle devant un ciel rouge qui se déchire." },
  { id:'09-joconde', qid:['Q12418'], title:'La Joconde', artist:'Léonard de Vinci', year:'c. 1503–1519', museum:'Musée du Louvre, Paris', ratio:0.67, movement:'Haute Renaissance', narrative:"Un visage, un sourire énigmatique, un paysage brumeux qui semble respirer." },
  { id:'10-vague', qid:['Q252485'], title:'La Grande Vague de Kanagawa', artist:'Katsushika Hokusai', year:'c. 1831', museum:'Metropolitan Museum of Art', ratio:1.47, movement:'Ukiyo-e', narrative:"Une vague immense soulève des doigts d'écume et menace trois barques minuscules." },
  { id:'11-venus', qid:['Q151047'], title:'La Naissance de Vénus', artist:'Sandro Botticelli', year:'c. 1485', museum:'Galerie des Offices, Florence', ratio:1.95, movement:'Renaissance', narrative:"Vénus arrive sur une coquille, poussée par le souffle du vent, tandis qu'une nymphe s'empresse de l'envelopper." },
  { id:'12-grande-jatte', commons:'La Grande Jatte Seurat', title:'Un dimanche après-midi à l’île de la Grande Jatte', artist:'Georges Seurat', year:'1884–1886', museum:'Art Institute of Chicago', ratio:1.58, movement:'Pointillisme', narrative:"Des promeneurs immobiles peuplent une rive verdoyante, composée de milliers de points de couleur." },
  { id:'13-ronde-nuit', qid:['Q219831'], title:'La Ronde de nuit', artist:'Rembrandt', year:'1642', museum:'Rijksmuseum, Amsterdam', ratio:1.33, movement:"Âge d'or néerlandais", narrative:"La milice d'Amsterdam s'ébranle dans la pénombre, entre portraits nets et ombres profondes." },
  { id:'14-liberte', qid:['Q29530'], title:'La Liberté guidant le peuple', artist:'Eugène Delacroix', year:'1830', museum:'Musée du Louvre, Paris', ratio:1.54, movement:'Romantisme', narrative:"Une femme nue guide le peuple enjambant les corps, drapeau au vent." },
  { id:'15-voyageur', qid:['Q311243'], title:'Le Voyageur au-dessus de la mer de nuages', artist:'Caspar David Friedrich', year:'c. 1818', museum:'Kunsthalle, Hambourg', ratio:0.72, movement:'Romantisme', narrative:"De dos, un homme se tient sur un rocher et domine une étendue de brume." },
  { id:'16-mai', qid:['Q1091086'], title:'Le 3 mai 1808', artist:'Francisco de Goya', year:'1814', museum:'Musée du Prado, Madrid', ratio:1.46, movement:'Romantisme', narrative:"Face au mur, un homme ouvre les bras dans un geste désespéré." },
  { id:'17-pluie', commons:'Rain Steam and Speed Turner', title:'Pluie, vapeur et vitesse', artist:'J. M. W. Turner', year:'1844', museum:'Bibliothèque universitaire KU Leuven', ratio:1.55, movement:'Romantisme', narrative:"Un train traverse un pont dans la pluie, enveloppé de vapeur et de lumière jaune." },
  { id:'18-baigneuses', commons:'Paul Cézanne, French - The Large Bathers - Google Art Project', title:'Les Grandes Baigneuses', artist:'Paul Cézanne', year:'1906', museum:'Philadelphia Museum of Art', ratio:0.78, movement:'Post-impressionnisme', narrative:"Des corps monumentaux s'installent sous les arbres, au bord d'une rivière." },
  { id:'19-moulin', qid:['Q683274'], title:'Bal du moulin de la Galette', artist:'Pierre-Auguste Renoir', year:'1876', museum:"Musée d'Orsay, Paris", ratio:1.34, movement:'Impressionnisme', narrative:"Sous les acacias, la foule danse, bavarde et rit dans la lumière tachetée." },
  { id:'20-danse', qid:['Q20188704','Q18758802'], title:'La Classe de danse', artist:'Edgar Degas', year:'c. 1874', museum:"Musée d'Orsay, Paris", ratio:1.37, movement:'Impressionnisme', narrative:"Dans un studio sobre, les danseuses ajustent leur collant, attendent, s'étirent." },
  { id:'21-gauguin', qid:['Q890678'], title:"D'où venons-nous ? Que sommes-nous ? Où allons-nous ?", artist:'Paul Gauguin', year:'1897–1898', museum:'Museum of Fine Arts, Boston', ratio:2.45, movement:'Post-impressionnisme', narrative:"De droite à gauche, la vie se déroule : l'enfance, la jeunesse, la maturité, la vieillesse." },
  { id:'22-rousseau', qid:['Q960447'], title:'Dans une forêt tropicale : lutte entre un tigre et un taureau', artist:'Henri Rousseau', year:'1891', museum:'Cleveland Museum of Art', ratio:0.75, movement:'Art naïf', narrative:"Sous des feuillages d'un vert dense, un tigre et un taureau s'affrontent au milieu de fleurs immenses." },
  { id:'23-ophelie', qid:['Q1065493'], title:'Ophélie', artist:'John Everett Millais', year:'1851–1852', museum:'Tate Britain, Londres', ratio:1.85, movement:'Pré-raphaélisme', narrative:"Ophélie flotte, les yeux ouverts, les mains crispées sur des fleurs, au milieu d'un ruisseau débordant." },
  { id:'24-vocation', qid:['Q969377'], title:'La Vocation de saint Matthieu', artist:'Le Caravage', year:'1599–1600', museum:'San Luigi dei Francesi, Rome', ratio:1.28, movement:'Baroque', narrative:"Dans une pièce sombre, un faisceau de lumière traverse la fenêtre et vient toucher des hommes attablés." },
  { id:'25-chambre', qid:['Q724377'], title:'La Chambre à Arles', artist:'Vincent van Gogh', year:'1888', museum:'Van Gogh Museum, Amsterdam', ratio:1.29, movement:'Post-impressionnisme', narrative:"Une chambre jaune, deux chaises, un lit : Van Gogh peint le repos à Arles." },
  { id:'26-corbeaux', qid:['Q634122'], title:'Champ de blé aux corbeaux', artist:'Vincent van Gogh', year:'1890', museum:'Van Gogh Museum, Amsterdam', ratio:1.68, movement:'Post-impressionnisme', narrative:"Un champ de blé ondule sous un ciel bleu-noir traversé de corbeaux." },
  { id:'27-pommes', qid:['Q24022716','Q154469'], title:'Les Mangeurs de pommes de terre', artist:'Vincent van Gogh', year:'1885', museum:'Van Gogh Museum, Amsterdam', ratio:1.28, movement:'Post-impressionnisme', narrative:"Autour d'une table basse, une famille paysanne mange dans la lumière d'une lampe." },
  { id:'28-gachet', qid:['Q17023940','Q843044'], title:'Portrait du docteur Gachet', artist:'Vincent van Gogh', year:'1890', museum:'Collection privée / Musée Van Gogh', ratio:0.81, movement:'Post-impressionnisme', narrative:"Le docteur est assis, une fleur à la main, le visage pâle dans un habit bleu." },
  { id:'29-gare', qid:['Q2270028'], title:'La Gare Saint-Lazare', artist:'Claude Monet', year:'1877', museum:"Musée d'Orsay, Paris", ratio:1.38, movement:'Impressionnisme', narrative:"Sous la verrière de la gare, la fumée des locomotives se mêle à la lumière." },
  { id:'30-ombrelle', qid:['Q2395218'], title:'Femme à l’ombrelle — Madame Monet et son fils', artist:'Claude Monet', year:'1875', museum:'National Gallery of Art, Washington', ratio:0.82, movement:'Impressionnisme', narrative:"Sur une colline ventée, une femme se tient sous une ombrelle, son fils à ses pieds." },
  { id:'31-laitiere', qid:['Q167605'], title:'La Laitière', artist:'Johannes Vermeer', year:'c. 1658–1661', museum:'Rijksmuseum, Amsterdam', ratio:0.85, movement:"Âge d'or néerlandais", narrative:"Une servante verse du lait dans un bol, debout devant une fenêtre." },
  { id:'32-delft', qid:['Q523974'], title:'Vue de Delft', artist:'Johannes Vermeer', year:'c. 1660–1661', museum:'Mauritshuis, La Haye', ratio:1.56, movement:"Âge d'or néerlandais", narrative:"La ville se déploie sous un ciel chargé, ses toits rouges et ses tours réfléchis dans l'eau." },
  { id:'33-anatomie', qid:['Q661378'], title:"La Leçon d'anatomie du docteur Tulp", artist:'Rembrandt', year:'1632', museum:'Mauritshuis, La Haye', ratio:1.56, movement:"Âge d'or néerlandais", narrative:"Des hommes se pressent autour d'un corps allongé, tandis que le docteur Tulp lève un scalpel." },
  { id:'34-fils', qid:['Q512755'], title:'Le Retour du fils prodigue', artist:'Rembrandt', year:'c. 1661–1669', museum:'Musée de l’Ermitage, Saint-Pétersbourg', ratio:1.53, movement:"Âge d'or néerlandais", narrative:"Un vieillard pose ses mains sur les épaules du fils revenu." },
  { id:'35-cene', qid:['Q128910'], title:'La Cène', artist:'Léonard de Vinci', year:'1495–1498', museum:'Santa Maria delle Grazie, Milan', ratio:2.08, movement:'Haute Renaissance', narrative:"Les apôtres réagissent autour du Christ au moment où il annonce la trahison." },
  { id:'36-hermine', qid:['Q474338'], title:"La Dame à l'hermine", artist:'Léonard de Vinci', year:'c. 1489–1490', museum:'Musée national, Cracovie', ratio:0.75, movement:'Haute Renaissance', narrative:"Une jeune femme tient un hermine blanc contre elle, dans une pièce presque noire." },
  { id:'37-ecole', qid:['Q186953'], title:"L'École d'Athènes", artist:'Raphaël', year:'1509–1511', museum:'Musées du Vatican', ratio:1.98, movement:'Haute Renaissance', narrative:"Platon et Aristote occupent le centre d'une architecture immense, entourés de philosophes et de géomètres." },
  { id:'38-adam', qid:['Q500242'], title:'La Création d’Adam', artist:'Michel-Ange', year:'c. 1511', museum:'Chapelle Sixtine, Vatican', ratio:1.37, movement:'Haute Renaissance', narrative:"Dieu et Adam se font face, leurs doigts presque joints, dans l'instant de la création." },
  { id:'39-printemps', qid:['Q549847'], title:'Le Printemps', artist:'Sandro Botticelli', year:'c. 1480', museum:'Galerie des Offices, Florence', ratio:1.93, movement:'Renaissance', narrative:"Dans un bosquet clair, Vénus préside aux jeux des Heures et des Grâces." },
  { id:'40-jardin', qid:['Q321303'], title:'Le Jardin des délices', artist:'Jérôme Bosch', year:'c. 1490–1510', museum:'Musée du Prado, Madrid', ratio:3.05, movement:'Renaissance nordique', narrative:"Trois volets déroulent le Paradis, le péché et l'Enfer en une foule minuscule." },
  { id:'41-chasseurs', commons:'Hunters in the Snow Bruegel', title:'Les Chasseurs dans la neige', artist:'Pieter Bruegel l’Ancien', year:'1565', museum:'Kunsthistorisches Museum, Vienne', ratio:1.65, movement:'Renaissance nordique', narrative:"Des chasseurs rentrent en file dans un paysage de neige, chiens à leurs côtés." },
  { id:'42-babel', qid:['Q699091','Q15293656'], title:'La Tour de Babel', artist:'Pieter Bruegel l’Ancien', year:'1563', museum:'Kunsthistorisches Museum, Vienne', ratio:1.37, movement:'Renaissance nordique', narrative:"Une tour spirale monte au-dessus d'une ville portuaire, minuscule et grouillante." },
  { id:'43-arnolfini', qid:['Q220859'], title:'Les Époux Arnolfini', artist:'Jan van Eyck', year:'1434', museum:'National Gallery, Londres', ratio:0.79, movement:'Primitifs flamands', narrative:"Dans une chambre étroite, un homme et une femme se tiennent main dans main, entourés d'objets minutieusement peints : miroir, chaussures, chien, luminaire." },
  { id:'44-ambassadeurs', qid:['Q1212937'], title:'Les Ambassadeurs', artist:'Hans Holbein le Jeune', year:'1533', museum:'National Gallery, Londres', ratio:1.01, movement:'Renaissance nordique', narrative:"Deux hommes debout, richement vêtus, sont entourés d'instruments de musique, de livres et de globes." },
  { id:'45-menines', commons:'Las Meninas Velazquez', title:'Les Ménines', artist:'Diego Vélasquez', year:'1656', museum:'Musée du Prado, Madrid', ratio:1.03, movement:'Siège d’or espagnol', narrative:"L'infante entourée de ses suivantes regarde vers nous, tandis que Vélasquez se peint au chevalet." },
  { id:'46-tolede', qid:['Q883994'], title:'Vue de Tolède', artist:'El Greco', year:'c. 1596–1600', museum:'Metropolitan Museum of Art', ratio:0.73, movement:'Siège d’or espagnol', narrative:"La ville s'élance en collines tourmentées sous un ciel vert-de-gris orageux." },
  { id:'47-marat', qid:['Q636537'], title:'La Mort de Marat', artist:'Jacques-Louis David', year:'1793', museum:'Musées royaux des Beaux-Arts, Bruxelles', ratio:1.64, movement:'Néoclassicisme', narrative:"Marat gît dans sa baignoire, une lettre à la main, le cou traversé par une plaie." },
  { id:'48-odalisque', qid:['Q1978815'], title:'La Grande Odalisque', artist:'Jean-Auguste-Dominique Ingres', year:'1814', museum:'Musée du Louvre, Paris', ratio:1.66, movement:'Néoclassicisme', narrative:"Une femme étendue, le dos tourné, règne sur un intérieur orientalisant de tissus et d'objets." },
  { id:'49-radeau', commons:'Le Radeau de La Méduse - Théodore Géricault - Musée du Louvre Peintures INV 4884', title:'Le Radeau de la Méduse', artist:'Théodore Géricault', year:'1819', museum:'Musée du Louvre, Paris', ratio:1.65, movement:'Romantisme', narrative:"Sur un radeau dérivant, des corps s'entassent, certains déjà morts, d'autres hurlent vers un navire lointain." },
  { id:'50-olympia', qid:['Q737062'], title:'Olympia', artist:'Édouard Manet', year:'1863', museum:"Musée d'Orsay, Paris", ratio:1.62, movement:'Impressionnisme', narrative:"Une jeune femme nue regarde frontalement le spectateur, allongée sur un divan, tandis qu'une servante lui tend des fleurs." },
  { id:'51-dejeuner', qid:['Q152509'], title:'Le Déjeuner sur l’herbe', artist:'Édouard Manet', year:'1863', museum:"Musée d'Orsay, Paris", ratio:1.94, movement:'Impressionnisme', narrative:"Dans une clairière, deux hommes vêtus discutent avec une femme nue qui les regarde ; une autre se baigne plus loin." },
  { id:'52-ornans', qid:['Q540488'], title:'Un enterrement à Ornans', artist:'Gustave Courbet', year:'1849–1850', museum:"Musée d'Orsay, Paris", ratio:2.34, movement:'Réalisme', narrative:"Une foule de villageois se rassemble autour d'une tombe ouverte, dans une plaine austère." },
  { id:'53-angelus', qid:['Q2571560'], title:'L’Angélus', artist:'Jean-François Millet', year:'1857–1859', museum:"Musée d'Orsay, Paris", ratio:1.19, movement:'Réalisme', narrative:"Dans un champ crépusculaire, un homme et une femme s'arrêtent, tête baissée, au son de la cloche." },
  { id:'54-whistler', qid:['Q687182'], title:'Arrangement en gris et noir I (La Mère de l’artiste)', artist:'James Abbott McNeill Whistler', year:'1871', museum:"Musée d'Orsay, Paris", ratio:0.74, movement:'Esthétisme', narrative:"Une vieille femme est assise de profil dans une pièce presque monochrome." },
  { id:'55-madamex', qid:['Q2664039'], title:'Madame X', artist:'John Singer Sargent', year:'1883–1884', museum:'Metropolitan Museum of Art', ratio:0.73, movement:'Portrait mondain', narrative:"Une femme en robe noire se tient de profil, un bras posé sur une table, le regard détourné." },
  { id:'56-adele', qid:['Q354396'], title:'Adèle Bloch-Bauer I', artist:'Gustav Klimt', year:'1907', museum:'Neue Galerie, New York', ratio:0.73, movement:'Jugendstil / Symbolisme', narrative:"Assise dans un fauteuil d'or, Adèle Bloch-Bauer regarde avec une assurance tranquille." },
  { id:'57-mort', qid:['Q2438357'], title:'La Mort et la jeune fille', artist:'Egon Schiele', year:'1915', museum:'Belvédère, Vienne', ratio:0.8, movement:'Expressionnisme', narrative:"Une jeune fille se blottit contre une figure sombre qui l'enlace." },
  { id:'58-composition', qid:['Q2990634'], title:'Composition VII', artist:'Vassily Kandinsky', year:'1913', museum:'Musée national d’Art, Moscou', ratio:1.53, movement:'Abstraction', narrative:"Des taches, des traits et des cercles se croisent : Kandinsky veut peindre comme on compose une musique." },
  { id:'59-carre', qid:['Q1170315'], commons:'Malevich Black Square', title:'Carré noir', artist:'Kazimir Malevitch', year:'1915', museum:'Galerie Tretiakov, Moscou', ratio:1, movement:'Suprématisme', narrative:"Un carré noir, légèrement incliné, occupe un champ clair : tout commence là." },
  { id:'60-joueurs', commons:'Card Players Cezanne', title:'Les Joueurs de cartes', artist:'Paul Cézanne', year:'1890–1895', museum:'Metropolitan Museum of Art', ratio:1.31, movement:'Post-impressionnisme', narrative:"Deux paysans sont assis face à face, une bouteille entre eux, les mains posées sur la table." },
  { id:'61-saintevictoire', qid:['Q27970742'], commons:'Montagne Sainte-Victoire Cezanne', title:'La Montagne Sainte-Victoire', artist:'Paul Cézanne', year:'1897', museum:'Scottish National Gallery', ratio:1.47, movement:'Post-impressionnisme', narrative:"La montagne se dresse au-dessus des toits et des arbres, ses pentes construites par des touches bleues, vertes et ocre." },
  { id:'62-danse', commons:'La Danse Matisse', title:'La Danse', artist:'Henri Matisse', year:'1910', museum:'Museum of Modern Art, New York', ratio:2.15, movement:'Fauvisme', narrative:"Cinq danseurs nus forment un cercle sur un fond bleu et vert." },
  { id:'63-fuji', commons:'Fine Wind Clear Morning Hokusai', title:'Le Fuji rouge', artist:'Katsushika Hokusai', year:'c. 1830–1832', museum:'Metropolitan Museum of Art', ratio:1.5, movement:'Ukiyo-e', narrative:"Le Fuji monte, rouge et net, au-dessus d'une forêt bleue, dans un ciel encore chargé de nuages." },
  { id:'64-shower', qid:['Q5826309'], title:'Averse soudaine sur le pont Shin-Ōhashi', artist:'Utagawa Hiroshige', year:'1857', museum:'Metropolitan Museum of Art', ratio:0.68, movement:'Ukiyo-e', narrative:"La pluie tombe en traits fins sur un pont enjambant la Sumida; des passagers se hâtent sous des parapluies." },
  { id:'65-qingming', qid:['Q714802'], title:'Le Long de la rivière pendant la fête de Qingming', artist:'Zhang Zeduan', year:'XIIe siècle (à vérifier)', museum:'Palais impérial, Pékin', ratio:11.5, movement:'Peinture chinoise', narrative:"Un long rouleau déroule les berges d'une rivière animée : ponts, boutiques, barques, foules et charrettes." },
  { id:'66-persan', commons:'Shahnameh miniature', title:'Miniature persane — scène de Shahnameh', artist:'École persane (à vérifier)', year:'à vérifier', museum:'Collection Aga Khan', ratio:1.2, movement:'Miniature persane', narrative:"Sur une page du Shahnameh, le roi Kayomars trône parmi ses courtisans en aplats colorés." },
  { id:'67-moghol', commons:'Emperor Shah Jahan, 1628', title:'Portrait de Shah Jahan', artist:'Manohar', year:'1628–1640', museum:'', ratio:0.75, movement:'Miniature moghole', narrative:"Manohar représente Shah Jahan, le souverain moghol, assis sur le trône du Paon dans un appareil de pourpre et d'or." },
  { id:'68-ottoman', commons:'Suleiman receiving Isabella and her son Sigismund circa 1540', title:'Soliman recevant Isabelle et Sigismond', artist:'École ottomane', year:'vers 1558', museum:'', ratio:1.1, movement:'Miniature ottomane', narrative:"Soliman le Magnifique reçoit Isabelle Jagiellon et son jeune fils Sigismond dans une scène de cour ottomane." },
  { id:"69-jugement-bosch", commons:"Last Judgment Bosch Hieronymus", title:"Le Jugement dernier", artist:"Jérôme Bosch", year:"vers 1504", museum:"Musée du Prado, Madrid", inventory:"", ratio:1.2, movement:"Renaissance nordique", narrative:"Au Jugement dernier, les corps se soulèvent tandis que les damnés sont entraînés vers des châtiments inventés avec une précision cruelle. Bosch peint la peur médiévale de l'au-delà comme une foule sans fin." },
  { id:"70-triomphe-mort", qid:["Q644856"], title:"Le Triomphe de la mort", artist:"Pieter Bruegel l'Ancien", year:"vers 1562", museum:"Musée du Prado, Madrid", inventory:"", ratio:1.65, movement:"Renaissance nordique", narrative:"Une armée de squelettes traverse un paysage desséché. Rois, paysans et amants sont emportés dans la même danse. Bruegel ne menace pas : il constate, avec une lucidité glacée." },
  { id:"71-lamentation-giotto", commons:"Lamentation Giotto Scrovegni", title:"La Lamentation", artist:"Giotto di Bondone", year:"vers 1305", museum:"Chapelle des Scrovegni, Padoue", inventory:"", ratio:1.55, movement:"Pré-Renaissance", narrative:"Le Christ descendu de la croix repose dans les bras des siens. Les anges se déchirent le ciel. Giotto donne au deuil une épaisseur humaine nouvelle, presque tactile." },
  { id:"72-christ-mort-mantegna", commons:"Dead Christ Mantegna", title:"Le Christ mort", artist:"Andrea Mantegna", year:"vers 1501", museum:"Pinacothèque de Brera, Milan", inventory:"", ratio:1.75, movement:"Renaissance", narrative:"Le corps est vu en raccourci, pieds vers nous. La douleur des proches se tait devant cette géométrie terrible. Mantegna place le spectateur au bord du tombeau." },
  { id:"73-saturne-goya", qid:["Q1150997"], title:"Saturne dévorant son fils", artist:"Francisco de Goya", year:"1819–1823", museum:"Musée du Prado, Madrid", inventory:"", ratio:0.82, movement:"Romantisme", narrative:"Dans l'obscurité, un titan dévore son enfant. Goya peint la folie du temps et du pouvoir sans détour. L'image reste insupportable parce qu'elle refuse toute consolation." },
  { id:"74-christ-mort-holbein", commons:"Dead Christ Holbein the Younger", title:"Le Christ mort", artist:"Hans Holbein le Jeune", year:"1521", museum:"Musée d'Art de Bâle", inventory:"", ratio:1.7, movement:"Renaissance nordique", narrative:"Le corps repose dans un caveau étroit, les mains croisées. Holbein ne glorifie rien : il regarde la mort en face, avec la même précision qu'un portrait de courtisan." },
  { id:"76-judith-klimt", qid:["Q2324643"], title:"Judith et la tête d'Holopherne", artist:"Gustav Klimt", year:"1901", museum:"Belvédère, Vienne", inventory:"", ratio:0.78, movement:"Jugendstil", narrative:"Judith tient la tête d'Holopherne, le regard assuré. L'or et les motifs charnels font de la violence un vertige. Klimt transforme la terreur en une icône sensuelle." },
  { id:"77-escarpolette", qid:["Q2629559"], title:"L'Escarpolette", artist:"Jean-Honoré Fragonard", year:"1767", museum:"Wallace Collection, Londres", inventory:"", ratio:1.32, movement:"Rococo", narrative:"Une jeune femme s'envole sur une balançoire tandis qu'un homme l'observe dans les arbres. La lumière verte et rose dit l'instant suspendu du désir, avant même le geste." },
  { id:"78-amour-sacre-profane", qid:["Q794077"], title:"Amour sacré et Amour profane", artist:"Titien", year:"1514", museum:"Galerie Borghèse, Rome", inventory:"", ratio:1.48, movement:"Haute Renaissance", narrative:"Deux femmes accompagnent un jeune musicien : l'une nue, l'autre vêtue. Titien ne tranche pas entre le corps et l'âme; il les fait converser dans une même lumière dorée." },
  { id:"79-naissance-venus-bouguereau", commons:"Birth of Venus Bouguereau", title:"La Naissance de Vénus", artist:"William-Adolphe Bouguereau", year:"1879", museum:"Musée d'Orsay, Paris", inventory:"", ratio:2.0, movement:"Académisme", narrative:"Des nymphes portent Vénus sur un coquillage, dans une lumière laiteuse. Bouguereau donne au mythe une douceur almost maternelle : la beauté arrive déjà paisible." },
  { id:"80-beata-beatrix", qid:["Q2712679"], title:"Beata Beatrix", artist:"Dante Gabriel Rossetti", year:"c. 1864–1870", museum:"Tate Britain, Londres", inventory:"", ratio:0.78, movement:"Pré-raphaélisme", narrative:"Beatrix est assise, les yeux fermés, tandis qu'un oiseau rouge dépose une fleur. Rossetti peint l'amour comme une vision intérieure, entre extase et pressentiment de la mort." },
  { id:"82-venus-cabanel", qid:["Q1212861"], title:"La Naissance de Vénus", artist:"Alexandre Cabanel", year:"1863", museum:"Musée d'Orsay, Paris", inventory:"", ratio:1.9, movement:"Académisme", narrative:"Vénus s'étend sur les flots, abandonnée au regard. La perfection du corps devient une surface lisse, presque irréelle. Cabanel incarne le rêve de beauté du XIXe siècle." },
  { id:"83-sacre-napoleon", qid:["Q1231009"], title:"Le Sacre de Napoléon", artist:"Jacques-Louis David", year:"1805–1807", museum:"Musée du Louvre, Paris", inventory:"", ratio:1.9, movement:"Néoclassicisme", narrative:"Devant une assemblée immense, Napoléon se couronne lui-même. David compose la scène comme un mouvement de foule. Le pouvoir se donne ici en spectacle, sous les lampes d'un édifice ancien." },
  { id:"84-serment-horaces", qid:["Q476458"], title:"Le Serment des Horaces", artist:"Jacques-Louis David", year:"1784", museum:"Musée du Louvre, Paris", inventory:"", ratio:1.85, movement:"Néoclassicisme", narrative:"Trois frères lèvent la main et jurent de défendre Rome, tandis que les femmes s'effondrent. David fait de l'honneur public un geste géométrique et du sacrifice une obligation." },
  { id:"85-philippe-iv", qid:["Q1090371"], title:"Philippe IV en brun et argent", artist:"Diego Vélasquez", year:"c. 1631–1635", museum:"National Gallery, Londres", inventory:"", ratio:0.72, movement:"Siège d'or espagnol", narrative:"Le roi se tient debout, vêtu de noir et d'argent, dans une lumière sobre. Vélasquez ne flatte guère : il peint le poids d'un règne sur un visage fatigué." },
  { id:"86-louis-xiv", qid:["Q3399440"], title:"Portrait de Louis XIV", artist:"Hyacinthe Rigaud", year:"1701", museum:"Musée du Louvre, Paris", inventory:"", ratio:0.68, movement:"Baroque", narrative:"Le roi apparaît drapé de bleu et d'or, jambes gainées, regard assuré. Rigaud codifie l'image du monarque absolu : la gloire devient une posture, presque un décor." },
  { id:"87-henri-viii", qid:["Q18685971"], title:"Portrait d'Henri VIII", artist:"Hans Holbein le Jeune", year:"c. 1537", museum:"Musée national, Madrid", inventory:"", ratio:0.72, movement:"Renaissance nordique", narrative:"Le roi occupe tout le cadre, épaules massives, regard de côté. Holbein rend la puissance par la seule présence physique. Le détail superflue disparaît devant l'autorité." },
  { id:"88-sardanapale", qid:["Q1133821"], title:"La Mort de Sardanapale", artist:"Eugène Delacroix", year:"1827", museum:"Musée du Louvre, Paris", inventory:"", ratio:1.95, movement:"Romantisme", narrative:"Sur un lit immense, le roi assiste au massacre de ses femmes et de ses chevaux. Delacroix peint la extravagance du pouvoir comme une scène de théâtre rouge et or." },
  { id:"89-massacre-scio", qid:["Q2290433"], title:"Le Massacre de Scio", artist:"Eugène Delacroix", year:"1824", museum:"Musée du Louvre, Paris", inventory:"", ratio:2.0, movement:"Romantisme", narrative:"Des habitants de Chios sont rassemblés, blessés, livrés aux soldats. Delacroix transpose l'événement en une foule douloureuse où la Lumière n'éclaire que l'injustice." },
  { id:"90-bateliers-volga", qid:["Q175628"], title:"Les Bateliers de la Volga", artist:"Ilya Repin", year:"c. 1870–1873", museum:"Musée russe, Saint-Pétersbourg", inventory:"", ratio:2.05, movement:"Réalisme", narrative:"Une file d'hommes tire un navire sur la berge, courbés sous l'effort. Repin ne crie pas : la fatigue collective suffit. La rivière immense rend le labeur plus silencieux encore." },
  { id:"91-wagon-troisieme", qid:["Q20195412"], title:"Le Wagon de troisième classe", artist:"Honoré Daumier", year:"c. 1856–1858", museum:"Musée d'Orsay, Paris", inventory:"", ratio:1.35, movement:"Réalisme", narrative:"Dans un compartiment étroit, des corps s'entassent, endormis ou résignés. Daumier trouve dans la vie quotidienne la dignité d'un sujet historique, sans héros déclaré." },
  { id:"94-apotheose-guerre", qid:["Q4068125"], title:"L'Apothéose de la guerre", artist:"Vassili Vereshchagin", year:"1871", museum:"Musée d'Art de Tver", inventory:"", ratio:1.45, movement:"Réalisme", narrative:"Un amas de crânes s'élève sous un ciel vide. Vereshchagin, qui avait vu la guerre, refuse la gloire : il dresse un monument à la seule humiliation des corps." },
  { id:"95-gassed", qid:["Q5526647"], title:"Gassed", artist:"John Singer Sargent", year:"1918–1919", museum:"Imperial War Museum, Londres", inventory:"", ratio:2.1, movement:"Réalisme", narrative:"Des soldats aveuglés par le gaz avancent en se tenant, dans une lumière jaune irréelle. Sargent choisit la retenue : l'horreur tient dans la file des corps et le silence." },
  { id:"96-horreurs-guerre", commons:"Peter Paul Rubens – Consequences of War (1638)", title:"Les Conséquences de la guerre", artist:"Pierre Paul Rubens", year:"1638", museum:"National Gallery, Londres", inventory:"", ratio:1.66, movement:"Baroque", narrative:"Mars entraîne une ville dans la ruine tandis que des corps sont piétinés. Rubens met toute sa puissance de composition au service d'une dénonciation violente." },
  { id:"97-execution-maximilien", qid:["Q1212269"], title:"L'Exécution de l'empereur Maximilien", artist:"Édouard Manet", year:"1867–1869", museum:"Musée d'Art de Mannheim", inventory:"", ratio:1.9, movement:"Réalisme", narrative:"Le peloton fait face à un homme et à ses proches, murs blancs derrière eux. Manet supprime le pathos héroïque : il ne reste que la lumière plate d'un moment irréversible." },
  { id:"98-jeune-martyre", commons:"Young Martyr Delaroche", title:"Jeune martyre", artist:"Paul Delaroche", year:"1855", museum:"Musée du Louvre, Paris", inventory:"", ratio:0.75, movement:"Romantisme", narrative:"Une jeune femme gît sur le sable, libérée de ses liens. Delaroche peint une mort sans emphase, presque tendre, où l'émotion tient à la pâleur du visage." },
  { id:"99-pollice-verso", qid:["Q1237863"], title:"Pollice Verso", artist:"Jean-Léon Gérôme", year:"1872", museum:"Phoenix Art Museum", inventory:"", ratio:1.3, movement:"Académisme", narrative:"Dans l'arène, des spectateurs lèvent le pouce vers le bas tandis qu'un gladiateur attend. Gérôme donne à la cruauté romaine la précision d'une scène de genre." },
  { id:"101-ile-morts", commons:"Isle of the Dead Arnold Böcklin", title:"L'Île des morts", artist:"Arnold Böcklin", year:"1880", museum:"Musée d'Art de Bâle", inventory:"", ratio:1.35, movement:"Symbolisme", narrative:"Une barque se dirige vers un îlot rocheux où veillent des cyprès noirs. Böcklin invente une image de la mort comme voyage, calme et irrévocable." },
  { id:"105-sorrow", file:"Vincent van Gogh - Sorrow.jpg", commons:"Vincent van Gogh - Sorrow", title:"Douleur", artist:"Vincent van Gogh", year:"1882", museum:"Musée Van Gogh, Amsterdam", inventory:"", ratio:0.75, movement:"Première période", narrative:"Une femme est assise, tête dans les mains, près d'un arbre nu. Van Gogh dessine la tristesse avant les couleurs éclatantes : le trait suffit à dire l'épuisement." },
  { id:"106-melencolia", qid:["Q1362177"], title:"Mélencolia I", artist:"Albrecht Dürer", year:"1514", museum:"Musée des Beaux-Arts, Leipzig", inventory:"", ratio:1.05, movement:"Renaissance nordique", narrative:"Une figure ailée est assise, entourée d'outils et d'un chien endormi. Dürer donne une forme à l'inquiétude de l'esprit qui sait trop et ne peut agir." },
  { id:"107-moine-mer", qid:["Q693746"], title:"Le Moine au bord de la mer", artist:"Caspar David Friedrich", year:"c. 1808–1810", museum:"Nationalgalerie, Berlin", inventory:"", ratio:2.0, movement:"Romantisme", narrative:"Un moine minuscule se tient devant une mer grise et un ciel sans contour. Friedrich efface les repères : le paysage devient l'espace d'un vertige intérieur." },
  { id:"108-melancholie-munch", commons:"Melancholy Edvard Munch", title:"Mélancolie", artist:"Edvard Munch", year:"1892", museum:"Musée national, Oslo", inventory:"", ratio:0.7, movement:"Expressionnisme", narrative:"Un homme est assis, la tête dans la main, sur un rocher bleu. Munch réduit le paysage à quelques bandes de couleur : la tristesse devient une structure." },
  { id:"109-vieil-homme", file:"Van Gogh - Trauernder alter Mann.jpeg", commons:"Van Gogh - Trauernder alter Mann", title:"À la porte de l’éternité", artist:"Vincent van Gogh", year:"1890", museum:"Musée Van Gogh, Amsterdam", inventory:"", ratio:0.78, movement:"Post-impressionnisme", narrative:"Un vieil homme se cache le visage dans ses mains. Les bleus violents et les jaunes fiévreux entourent une douleur sans récit, offerte dans sa seule posture." },
  { id:"110-interieur-hammershoi", commons:"Interior Vilhelm Hammershoi", title:"Intérieur", artist:"Vilhelm Hammershøi", year:"c. 1900", museum:"Musée national, Copenhague", inventory:"", ratio:0.9, movement:"Symbolisme nordique", narrative:"Une pièce presque vide, une femme de dos, une lumière grise venant d'une fenêtre. Hammershøi peint le silence domestique comme un état de suspension." },
  { id:"112-cauchemar", qid:["Q2317837"], title:"Le Cauchemar", artist:"Henry Fuseli", year:"1781", museum:"Detroit Institute of Arts", inventory:"", ratio:1.35, movement:"Romantisme", narrative:"Un cavalier de cauchemar pèse sur une dormeuse tandis qu'une tête de cheval surgit dans l'ombre. Fuseli peint l'angoisse nocturne comme une arrivée physique." },
  { id:"113-reve-rousseau", commons:"The Dream Henri Rousseau", title:"Le Rêve", artist:"Henri Rousseau", year:"1910", museum:"Museum of Modern Art, New York", inventory:"", ratio:1.9, movement:"Art naïf", narrative:"Une femme repose dans une jungle verte peuplée de fleurs et d'animaux. Rousseau construit un rêve sans perspective savante, d'une netteté qui rend l'étrange crédible." },
  { id:"114-cyclope-redon", commons:"The Cyclops Odilon Redon", title:"Le Cyclope", artist:"Odilon Redon", year:"c. 1910", museum:"Musée d'Orsay, Paris", inventory:"", ratio:0.85, movement:"Symbolisme", narrative:"Un œil unique s'élève au-dessus d'un paysage de fleurs. Redon fait du monstre une apparition presque douce, née de la seule couleur." },
  { id:"115-ancient-days", commons:"The Ancient of Days William Blake", title:"L'Ancien des jours", artist:"William Blake", year:"c. 1794", museum:"Tate Britain, Londres", inventory:"", ratio:0.82, movement:"Romantisme", narrative:"Un vieillard se penche depuis un disque de lumière et trace un cercle avec un compas. Blake donne à la création la forme d'un geste géométrique et solennel." },
  { id:"116-danse-noces", qid:["Q3702434"], title:"La Danse de noces", artist:"Pieter Bruegel l'Ancien", year:"c. 1566", museum:"Detroit Institute of Arts", inventory:"", ratio:1.7, movement:"Renaissance nordique", narrative:"Des paysans dansent en plein air, lourds et joyeux, dans un mouvement de foule. Bruegel observe la fête populaire avec tendresse et sans ironie." },
  { id:"117-baignade-asnieres", qid:["Q1090837"], title:"Baignade à Asnières", artist:"Georges Seurat", year:"1884", museum:"National Gallery, Londres", inventory:"", ratio:1.85, movement:"Pointillisme", narrative:"Par une chaude journée, des ouvriers se baignent à la Seine. Seurat transforme la scène en une mosaïque de lumière où la joie reste discrète." },
  { id:"118-bord-mer-sorolla", commons:"Joaquin Sorolla - Niños en el Mar, Playa de Valencia (1908)", title:"Enfants dans la mer, plage de Valence", artist:"Joaquín Sorolla", year:"1908", museum:"", inventory:"", ratio:1.3, movement:"Impressionnisme espagnol", narrative:"Des enfants jouent dans l'eau peu profonde, dans une lumière blanche et salée. Sorolla fixe l'instant lumineux de l'été avec une liberté de touche presque photographique." },
  { id:"121-temeraire", qid:["Q257580"], title:"Le Téméraire remorqué", artist:"J. M. W. Turner", year:"1839", museum:"National Gallery, Londres", inventory:"", ratio:1.85, movement:"Romantisme", narrative:"Un vieux vaisseau, noir et rouge, est tiré vers le chantier de démolition par une remorqueur minuscule. Turner fait du crépuscule une élégie." },
  { id:"122-tempete-neige", commons:"Snow Storm Steam-Boat Turner", title:"Tempête de neige", artist:"J. M. W. Turner", year:"1842", museum:"Tate Britain, Londres", inventory:"", ratio:1.35, movement:"Romantisme", narrative:"Un navire disparaît dans un tourbillon de neige et de vapeur. Turner dissout la forme dans l'élément : la mer devient une force sans visage." },
  { id:"123-chariot-foin", qid:["Q2366825"], title:"Le Chariot de foin", artist:"John Constable", year:"1821", museum:"National Gallery, Londres", inventory:"", ratio:1.85, movement:"Romantisme", narrative:"Un charrette s'enfonce dans un chemin boueux, sous un ciel d'orage. Constable rend la campagne anglaise avec une tendresse attentive aux moindres nuances." },
  { id:"124-oxbow", qid:["Q3172259"], title:"The Oxbow", artist:"Thomas Cole", year:"1836", museum:"Metropolitan Museum of Art", inventory:"", ratio:1.85, movement:"Hudson River School", narrative:"Depuis une hauteur, une rivière se courbe entre forêt sauvage et champs cultivés. Cole tient ensemble deux visages de l'Amérique : la nature et l'œuvre humaine." },
  { id:"125-sierra-nevada", qid:["Q20475372"], title:"Among the Sierra Nevada, California", artist:"Albert Bierstadt", year:"1868", museum:"Smithsonian American Art Museum", inventory:"", ratio:2.0, movement:"Hudson River School", narrative:"Un lac reflète des montagnes enneigées dans une lumière dorée. Bierstadt compose un paysage ample, presque sacré, à la mesure du continent." },
  { id:"126-averse-hiroshige", commons:"Sudden Shower over Shin-Ohashi Bridge Hiroshige", title:"Averse soudaine sur le pont Shin-Ōhashi", artist:"Utagawa Hiroshige", year:"1857", museum:"Metropolitan Museum of Art", inventory:"", ratio:0.7, movement:"Ukiyo-e", narrative:"Sous une pluie oblique, des passants franchissent un pont sur le Sumida. Hiroshige transforme un abri de fortune en un instant de vie suspendu." },
];

/* ------------------------------ API ------------------------------ */
let lastWD = 0, lastCommons = 0;
async function api(url, headers = { 'User-Agent': UA }, tries = 6, kind = '') {
  let delay = 3000;
  for (let i = 0; i < tries; i++) {
    const key = kind === 'wd' ? 'lastWD' : kind === 'commons' ? 'lastCommons' : null;
    if (key) { const wait = (kind === 'wd' ? lastWD : lastCommons) + (kind === 'wd' ? 3000 : 2200) - Date.now(); if (wait > 0) await sleep(wait); }
    try {
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(45000) });
      if (key) { if (kind === 'wd') lastWD = Date.now(); else lastCommons = Date.now(); }
      if (r.ok) return await r.json();
      if (r.status !== 429 && r.status < 500) throw new Error('HTTP ' + r.status);
    } catch (e) { if (i === tries - 1) throw e; }
    await sleep(delay); delay = Math.min(24000, delay * 2);
  }
  throw new Error('échec API');
}
function wdUrl(params) { const u = new URL('https://www.wikidata.org/w/api.php'); Object.entries({ format:'json', ...params }).forEach(([k,v]) => u.searchParams.set(k,v)); return u.toString(); }
function commonsUrl(params) { const u = new URL('https://commons.wikimedia.org/w/api.php'); Object.entries({ format:'json', origin:'*', maxlag:'5', ...params }).forEach(([k,v]) => u.searchParams.set(k,v)); return u.toString(); }
async function wdEntities(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 25) {
    const j = await api(wdUrl({ action:'wbgetentities', ids:ids.slice(i,i+25).join('|'), props:'labels|descriptions|claims', languages:'fr|en|de|it|es' }), { 'User-Agent': WD_UA }, 6, 'wd');
    Object.assign(out, j.entities || {});
  }
  return out;
}
async function commonsInfo(files) {
  const out = new Map();
  for (let i = 0; i < files.length; i += 20) {
    const batch = files.slice(i,i+20).map(f => f.startsWith('File:') ? f : 'File:' + f);
    const j = await api(commonsUrl({ action:'query', titles:batch.join('|'), prop:'imageinfo', iiprop:'url|size|extmetadata', iiurlwidth:String(TARGET_DIM), iiurlheight:String(TARGET_DIM) }), { 'User-Agent': UA }, 6, 'commons');
    Object.values(j.query?.pages || {}).forEach(p => {
      const ii = p.imageinfo?.[0]; if (!ii) return;
      const em = ii.extmetadata || {};
      out.set(p.title.replace(/^File:/,''), {
        title:p.title.replace(/^File:/,''), url:ii.thumburl || ii.url, originalUrl:ii.url,
        license:strip(em.LicenseShortName?.value) || strip(em.UsageTerms?.value) || 'inconnue',
        licenseUrl:strip(em.LicenseUrl?.value), credit:strip(em.Artist?.value),
        description:strip(em.ImageDescription?.value), source:ii.descriptionurl || ('https://commons.wikimedia.org/wiki/' + encodeURIComponent(p.title.replace(/ /g,'_'))),
        original:[ii.width,ii.height], thumb:[ii.thumbwidth || ii.width, ii.thumbheight || ii.height]
      });
    });
  }
  return out;
}
async function commonsSearch(q) {
  const j = await api(commonsUrl({ action:'query', list:'search', srsearch:'filetype:bitmap '+q, srnamespace:'6', srlimit:'30' }), { 'User-Agent': UA }, 6, 'commons');
  const titles = (j.query?.search || []).map(x => x.title);
  return titles.length ? commonsInfo(titles) : new Map();
}
function claimValues(e, p) { return (e?.claims?.[p] || []).map(x => x.mainsnak?.datavalue?.value).filter(Boolean); }
function claimId(e, p) { return claimValues(e,p).map(v => typeof v === 'object' ? v.id : v).filter(Boolean); }
function claimAmount(e, p) { const v = claimValues(e,p)[0]; return v && v.amount ? parseFloat(v.amount) : (typeof v === 'number' ? v : NaN); }
function bestLabel(e) { return e?.labels?.fr?.value || e?.labels?.en?.value || ''; }
function physicalRatio(e) { const w = claimAmount(e,'P2049'), h = claimAmount(e,'P2048'); return Number.isFinite(w) && Number.isFinite(h) && h ? w/h : NaN; }
const STOP = new Set(['ancien','ancienne','jeune','elder','younger','school','ecole','atelier','saint','st','the','de','la','le','du','des','von','van','der','den','musee','museum']);
const keys = (v, min=4) => norm(v).split(/[^a-z0-9]+/).filter(w => w.length>=min && !STOP.has(w));
const bigEnough = c => Math.max(c.original[0]||0,c.original[1]||0) >= MIN_DIM;
function score(a, info, ent, labels) {
  let s = 0, notes = [];
  const text = norm([a.title, ent ? bestLabel(ent) : '', ent ? (ent.descriptions?.en?.value || ent.descriptions?.fr?.value || '') : '', info.title || '', info.description || ''].join(' '));
  const creator = claimId(ent,'P170').map(id => labels[id] || '').join(' ');
  const cKeys = [...new Set([...keys(a.artist),...keys(creator)])];
  const coll = claimId(ent,'P195').map(id => labels[id] || '').join(' ');
  const collKeys = [...new Set([a.museum,coll,info.description||''].flatMap(keys))];
  const titleKeys = keys(a.title);
  const titleScore = Math.max(dice(a.title, bestLabel(ent) || a.title), dice(a.title, info.title || ''), titleKeys.length ? titleKeys.filter(w => text.includes(w)).length/titleKeys.length : 0);
  s += titleScore * 0.25; notes.push('titre ' + titleScore.toFixed(2));
  const artistScore = /^(ecole|school|atelier)/.test(norm(a.artist)) ? 0.5 : (cKeys.length ? (cKeys.some(w => text.includes(w)) ? 1 : dice(a.artist, creator)) : 0.35);
  s += artistScore * 0.30; notes.push('créateur ' + artistScore.toFixed(2));
  const collScore = collKeys.length ? (collKeys.some(w => text.includes(w)) ? 1 : 0.35) : 0.45;
  s += collScore * 0.15; notes.push('collection ' + collScore.toFixed(2));
  if (a.inventory) { const inv = claimValues(ent,'P217').map(String).join(' '); const invScore = norm(inv).includes(norm(a.inventory)) ? 1 : 0; s += invScore * 0.10; notes.push('inventaire ' + invScore); }
  else s += 0.05;
  const r0 = physicalRatio(ent), ar0 = info.original[0] / Math.max(1,info.original[1]);
  const orient = r => Number.isFinite(r) && r ? (a.ratio >= 1 ? Math.max(r,1/r) : Math.min(r,1/r)) : NaN;
  const ratio = orient(r0), ar = orient(ar0);
  const ratioScore = Number.isFinite(ratio) && Number.isFinite(ar) && ratio ? Math.max(0, 1 - Math.abs(ar/a.ratio - 1)) : 0.6;
  s += ratioScore * 0.20; notes.push('ratio ' + ratioScore.toFixed(2));
  if (/(detail|crop|x[0-9]+-y[0-9]+|zoom)/i.test(info.title || '')) s -= 0.25;
  if (!OPEN.test(info.license)) s -= 0.5;
  return { score:clamp01(s), notes };
}
const clamp01 = v => Math.max(0, Math.min(1, v));

/* ------------------------------ Fichiers ------------------------------ */
function sizeFromBytes(b) {
  if (b.length > 24 && b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i < b.length - 9;) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i+1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      if (m === 0xd9 || m === 0xda) break;
      const len = b.readUInt16BE(i+2);
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(m)) return { w:b.readUInt16BE(i+7), h:b.readUInt16BE(i+5) };
      i += 2 + len;
    }
  }
  if (b.length > 24 && b.subarray(1,4).toString() === 'PNG') return { w:b.readUInt32BE(16), h:b.readUInt32BE(20) };
  return null;
}
async function download(url, headers, dest) {
  const part = dest + '.part';
  let start = 0;
  try { start = (await fs.stat(part)).size; } catch {}
  const h = { ...headers };
  if (start > 0) h.Range = 'bytes=' + start + '-';
  const r = await fetch(url, { headers:h, signal:AbortSignal.timeout(90000) });
  if (!r.ok && r.status !== 206) throw new Error('HTTP ' + r.status);
  let prev = Buffer.alloc(0);
  if (r.status === 206 && start > 0) prev = await fs.readFile(part); else start = 0;
  const chunks = [];
  for await (const c of r.body) chunks.push(Buffer.from(c));
  const bytes = Buffer.concat([prev, ...chunks]);
  await fs.writeFile(part, bytes);
  await fs.rename(part, dest);
  return bytes;
}
function ffmpeg(args, input) {
  return new Promise((resolve,reject) => {
    const p = spawn('ffmpeg', ['-y','-loglevel','error',...args]);
    const chunks=[], err=[];
    p.stdout.on('data',c=>chunks.push(c)); p.stderr.on('data',c=>err.push(c));
    p.on('error',reject);
    p.on('close',code=>code===0?resolve(Buffer.concat(chunks)):reject(new Error('ffmpeg '+code+' '+Buffer.concat(err).toString().slice(0,120))));
    if (input !== undefined) p.stdin.end(input);
  });
}
async function analyze(file) {
  const buf = await fs.readFile(file);
  const hash = await ffmpeg(['-i',file,'-vf','scale=16:16:flags=area,format=gray','-f','rawvideo','-']);
  const vals=[...hash.slice(0,256)].sort((x,y)=>x-y), med=(vals[127]+vals[128])/2;
  let bits=0n; for (let i=0;i<256;i++) bits = (bits<<1n) | (hash[i] > med ? 1n : 0n);
  const dom = await ffmpeg(['-i',file,'-vf','scale=1:1','-f','rawvideo','-pix_fmt','rgb24','-']);
  let cropBox = null;
  try {
    let out = ''; const p = spawn('ffmpeg',['-hide_banner','-i',file,'-vf','cropdetect=limit=24:round=2:reset=0','-f','null','-']);
    p.stderr.on('data',c=>out += c); await new Promise(r=>p.on('close',r));
    const all = [...out.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)].map(m=>m.slice(1).map(Number));
    const last = all[all.length-1];
    if (last) cropBox = { x:last[2], y:last[3], w:last[0], h:last[1] };
  } catch {}
  return { size:sizeFromBytes(buf), bytes:buf.length, hash:bits.toString(16).padStart(64,'0'), dominant:[dom[0]||0,dom[1]||0,dom[2]||0], cropBox };
}
function hamming(a,b) { let x=BigInt('0x'+a)^BigInt('0x'+b), n=0; while(x){n+=Number(x&1n);x>>=1n} return n; }

/* ------------------------------ Main ------------------------------ */
async function main() {
  await fs.mkdir(OUT,{recursive:true});
  const bad = CATALOG.filter(a => { const n = words(a.narrative); return n < 40 || n > 60; });
  if (bad.length) console.log('ATTENTION récits hors 40–60 mots : ' + bad.map(a=>a.id+'='+words(a.narrative)).join(', '));

  const targets = ONLY ? CATALOG.filter(a=>ONLY.has(a.id)) : CATALOG;
  const allQids = [...new Set(targets.flatMap(a=>a.qid||[]))];
  let previous = [];
  try { previous = JSON.parse(await fs.readFile(path.join(OUT,'manifest.json'),'utf8')).artworks || []; } catch {}
  let entities = {}, labels = {};
  try {
    entities = await wdEntities(allQids);
    const refIds = [...new Set(allQids.flatMap(q=>[...claimId(entities[q],'P170'),...claimId(entities[q],'P195')]))];
    for (let i=0;i<refIds.length;i+=25) {
      const j = await api(wdUrl({ action:'wbgetentities', ids:refIds.slice(i,i+25).join('|'), props:'labels', languages:'fr|en|de|it|es' }), { 'User-Agent':WD_UA }, 6, 'wd');
      Object.entries(j.entities||{}).forEach(([id,e])=>labels[id]=bestLabel(e));
    }
    console.log('Wikidata : ' + Object.keys(entities).length + ' œuvres, ' + Object.keys(labels).length + ' libellés');
  } catch(e) { console.log('Wikidata indisponible : ' + e.message); }

  const files = [...new Set(allQids.flatMap(q=>claimValues(entities[q],'P18').map(String)))];
  let infos = new Map();
  try { infos = await commonsInfo(files); console.log('Commons : ' + infos.size + ' fiches liées'); }
  catch(e) { console.log('Commons indisponible : ' + e.message); }

  const manifest=[], failures=[], substitutions=[], cache=new Map();
  for (let i=0;i<targets.length;i++) {
    const a=targets[i];
    process.stdout.write(`[${String(i+1).padStart(2,'0')}/${targets.length}] ${a.title} — `);
    const candidates=[];
    if (a.file) {
      try {
        const exact=await commonsInfo(['File:'+a.file.replace(/^File:/,'')]);
        const info=[...exact.values()][0];
        if (info) candidates.push({ ...info, qid:null, match:0.99, notes:['fichier imposé'], verified:false });
      } catch(e) { console.log('fichier imposé indisponible ('+e.message+')'); }
    }
    for (const qid of a.qid||[]) {
      const ent=entities[qid]; if (!ent) continue;
      for (const f of claimValues(ent,'P18')) {
        const info=infos.get(String(f)); if (!info) continue;
        const sc=score(a,info,ent,labels);
        candidates.push({ ...info, qid, match:sc.score, notes:sc.notes, verified:sc.score>=0.60 });
      }
    }
    if (a.commons && !candidates.some(c=>c.match>=0.60 && bigEnough(c))) {
      try {
        for (const info of (await commonsSearch(a.commons)).values()) {
          const sc=score(a,info,null,labels);
          candidates.push({ ...info, qid:null, match:sc.score, notes:sc.notes, verified:false });
        }
      } catch(e) { console.log('recherche Commons échouée ('+e.message+')'); }
    }
    if (a.aicId && !candidates.some(c=>c.match>=0.60 && bigEnough(c))) {
      try {
        const j=await api('https://api.artic.edu/api/v1/artworks/'+a.aicId+'?fields=id,title,image_id,is_public_domain',{'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/156 Safari/537.36'});
        if (j.data?.is_public_domain && j.data.image_id) {
          const base=j.config?.iiif_url||'https://www.artic.edu/iiif/2';
          candidates.push({ title:'AIC '+a.aicId, url:`${base}/${j.data.image_id}/full/${TARGET_DIM},/0/default.jpg`, originalUrl:`${base}/${j.data.image_id}/full/max/0/default.jpg`, license:'Public domain (CC0)', licenseUrl:'https://www.artic.edu/open-access', credit:'Art Institute of Chicago', description:j.data.title, source:'https://www.artic.edu/artworks/'+a.aicId, original:[0,0], thumb:[TARGET_DIM,0], qid:null, match:0.72, notes:['AIC is_public_domain'], verified:false, headers:{'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/156 Safari/537.36',Referer:'https://www.artic.edu/'} });
        }
      } catch(e) { console.log('AIC indisponible ('+e.message+')'); }
    }
    candidates.sort((x,y)=>(y.verified-y.verified)+(y.match-x.match));
    const viable=candidates.filter(c=>c.match>=0.55 && OPEN.test(c.license) && bigEnough(c));
    if (!viable.length) {
      failures.push({ id:a.id, title:a.title, reason:'aucun candidat retenu (score, licence libre, côté long ≥2000 px)', candidates:candidates.slice(0,3).map(c=>({file:c.title,license:c.license,score:c.match,notes:c.notes})) });
      console.log('ÉCHEC'); continue;
    }
    const file=a.id+'.jpg', dest=path.join(OUT,file);
    let chosen=null, an=null, err='';
    for (const c of viable) {
      try {
        if (VERIFY) an=await analyze(dest);
        else { await download(c.url,c.headers||{'User-Agent':UA},dest); an=await analyze(dest); }
        if (!an.size || Math.max(an.size.w,an.size.h)<MIN_DIM) throw new Error('dimensions '+JSON.stringify(an.size));
        const dup=[...cache.entries()].find(([h])=>hamming(h,an.hash)<=16);
        if (dup) { err='doublon perceptuel de '+dup[1]; continue; }
        chosen=c; break;
      } catch(e) { err=e.message; }
    }
    if (!chosen || !an) { failures.push({ id:a.id,title:a.title,reason:err||'aucun fichier exploitable', candidates:viable.map(c=>({file:c.title,license:c.license,score:c.match,original:c.original,thumb:c.thumb,url:c.url})).slice(0,8) }); console.log('ÉCHEC '+(err||'').slice(0,60)); continue; }
    cache.set(an.hash,a.id);
    if (!a.qid || a.qid[0] !== chosen.qid) substitutions.push({ id:a.id, from:a.qid?.[0]||a.commons, to:chosen.qid||chosen.title, score:chosen.match });
    const ent=entities[chosen.qid];
    manifest.push({
      id:a.id, filename:file, title:a.title, artist:a.artist, year:a.year, museum:a.museum,
      inventory:a.inventory||(ent?claimValues(ent,'P217').map(String).join(' / '):''),
      wikidata:chosen.qid||null, creatorQid:ent?claimId(ent,'P170')[0]||null:null,
      license:chosen.license, licenseUrl:chosen.licenseUrl||'', credit:chosen.credit||'', source:chosen.source,
      filePage:chosen.title?('https://commons.wikimedia.org/wiki/'+encodeURIComponent('File:'+chosen.title.replace(/ /g,'_'))):'',
      width:an.size.w, height:an.size.h, matchScore:Number(chosen.match.toFixed(3)), matchNotes:chosen.notes,
      verified:!!chosen.verified, cropBox:an.cropBox, dominantColor:an.dominant,
      narrative:a.narrative, narrativeWords:words(a.narrative), byteSize:an.bytes
    });
    console.log(`${an.size.w}×${an.size.h} · score ${chosen.match.toFixed(2)} · ${chosen.verified?'vérifié':'à confirmer'} · ${chosen.license}`);
    if (!PROBE) await sleep(120);
  }
  const merged = ONLY ? [...previous.filter(x=>!ONLY.has(x.id)), ...manifest] : manifest;
  await fs.writeFile(path.join(OUT,'manifest.json'), JSON.stringify({
    schema:'voie-lactee/manifest/v2', generator:'download-artworks.mjs', version:2,
    generatedAt:new Date().toISOString(), verifiedCount:merged.filter(m=>m.verified).length,
    notice:'Uniquement des œuvres du domaine public ou CC0. Vérifiez les droits locaux avant publication.',
    count:merged.length, artworks:merged
  },null,2));
  await fs.writeFile(path.join(OUT,'download-report.json'), JSON.stringify({ generatedAt:new Date().toISOString(), mode:VERIFY?'verify':'download', failures, substitutions, unresolved:CATALOG.filter(a=>!merged.some(m=>m.id===a.id)).map(a=>({id:a.id,title:a.title})), count:merged.length },null,2));
  await fs.writeFile(path.join(OUT,'contact-sheet.html'), contactSheet(merged));
  console.log(`\nTerminé : ${merged.length}/${CATALOG.length} œuvres · ${merged.filter(m=>m.verified).length} vérifiées · ${failures.length} échec(s).`);
  if (failures.length) console.log(failures.map(f=>' - '+f.title+' : '+f.reason).join('\n'));
}
function contactSheet(items) {
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Voie Lactée — planche de contrôle</title>
<style>body{background:#0b0b0d;color:#eee;font:12px/1.4 system-ui; margin:24px}h1{font-weight:400;letter-spacing:.2em}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:18px}figure{margin:0;background:#111;border:1px solid #222;padding:8px}img{width:100%;height:180px;object-fit:contain;background:#000}figcaption{padding-top:8px}b{font-weight:500}.m{color:#8fa; font-size:10px}.warn{color:#fba}</style>
<h1>Planche de contrôle · ${items.length} œuvres</h1><div class="grid">${items.map(a=>`<figure><img src="${esc(a.filename)}" alt="${esc(a.title)}"><figcaption><b>${esc(a.title)}</b><br><span class="m">${esc(a.artist)} · ${esc(a.year)}</span><br><span class="m">score ${a.matchScore} · ${a.verified?'vérifié':'à confirmer'}</span><br><span class="warn">${esc(a.cropBox?'cadre détecté':'')}</span></figcaption></figure>`).join('')}</div></html>`;
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
main().catch(e=>{console.error('Erreur fatale :',e);process.exitCode=1});
