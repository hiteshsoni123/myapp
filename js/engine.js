/* =========================================================================
   Dhandha — Local AI Content Engine
   ---------------------------------------------------------------------------
   Bina kisi API key ke, device pe hi area-specific business content banata hai.
   Deterministic seeded generation -> same user + same area = stable feed,
   lekin combos itne zyada hain ki practically content khatam nahi hota.
   ========================================================================= */

(function (global) {
  'use strict';

  /* ------------------------- RNG utilities ------------------------------ */
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick  = (r, a) => a[Math.floor(r() * a.length) % a.length];
  const ri    = (r, a, b) => a + Math.floor(r() * (b - a + 1));
  const rf    = (r, a, b) => a + r() * (b - a);
  const chance = (r, p) => r() < p;
  function picks(r, arr, n) {
    const c = arr.slice(), out = [];
    while (out.length < n && c.length) out.push(c.splice(Math.floor(r() * c.length), 1)[0]);
    return out;
  }
  function shuffle(r, arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  /* ------------------------- Number formatting -------------------------- */
  function inr(n) {
    n = Math.round(n);
    const neg = n < 0; n = Math.abs(n);
    const s = String(n);
    let last3 = s.slice(-3), rest = s.slice(0, -3);
    if (rest) last3 = ',' + last3;
    while (rest.length > 2) { last3 = ',' + rest.slice(-2) + last3; rest = rest.slice(0, -2); }
    return (neg ? '-' : '') + '\u20B9' + rest + last3;
  }
  const round5 = n => Math.round(n / 5) * 5;
  const round10 = n => Math.round(n / 10) * 10;
  const round100 = n => Math.round(n / 100) * 100;
  const round500 = n => Math.round(n / 500) * 500;

  /* ================= KNOWLEDGE BASE ==================================== */
  /* type: food | place | service | retail | generic                        */

  const TYPE_DEFAULTS = {
    food:    { setup: [45000, 180000], rent: [6000, 25000], staff: [1, 4], margin: [45, 62],
               unitCost: [6, 22], unitPrice: [15, 60], daily: [120, 700],
               licenses: ['FSSAI Registration (Basic)', 'Shop & Establishment Act', 'Local Municipal Trade License', 'GST (turnover 40L+ par)'],
               peak: ['shaam 5 baje se 9 baje tak', 'subah 9 se 11 baje tak', 'dopahar 12 se 3 baje tak'],
               raw: ['fresh raw material', 'packaging', 'cooking gas', 'masale/spices'],
               equip: ['commercial kitchen setup', 'gas connection + cylinder', 'display counter', 'weighing scale', 'deep freezer'],
               staffRoles: ['karigar / cook', 'helper', 'counter / billing person', 'delivery boy'],
               risks: ['raw material ka rate badhna', 'kharab mausam me footfall girna', 'staff ka turnover', 'tel/gas ki quality'],
               kpi: ['daily pieces sold', 'per-piece profit', 'waste %', 'repeat customer ratio'],
               hygiene: ['roz counter aur kadhai saaf karna', 'tel 3-4 din me badalna', 'staff ke liye gloves + apron', 'kide-makode se bachne ke liye sealed containers'],
               seasonal: ['Diwali', 'Shaadi ka season', 'Barish ka season', 'Summer vacation']
             },
    place:   { setup: [300000, 1500000], rent: [25000, 120000], staff: [4, 18], margin: [18, 32],
               unitCost: [120, 400], unitPrice: [350, 1400], daily: [15, 90],
               licenses: ['Shop & Establishment Act', 'GST Registration', 'Fire NOC', 'Local Municipal Trade License', 'Police Verification of staff', 'FSSAI (agar kitchen hai)'],
               peak: ['weekend (Fri–Sun)', 'shaam 7 se 11 baje tak', 'wedding season', 'festival week'],
               raw: ['linen aur housekeeping supplies', 'kitchen raw material', 'toiletries / amenities', 'maintenance items'],
               equip: ['furniture + fittings', 'kitchen equipment', 'laundry setup', 'CCTV + billing software', 'power backup'],
               staffRoles: ['manager', 'front desk / reception', 'housekeeping staff', 'kitchen staff', 'security guard'],
               risks: ['occupancy rate girta', 'staff attrition', 'rent escalation', 'negative online reviews', 'seasonal dip'],
               kpi: ['occupancy / utilisation %', 'average bill value', 'staff cost %', 'repeat + referral %'],
               hygiene: ['room/service check-sheet daily', 'linen change protocol', 'washroom deep-clean har 3 din', 'pest control monthly'],
               seasonal: ['wedding season', 'summer vacation', 'festival week', 'corporate event season']
             },
    service: { setup: [60000, 400000], rent: [8000, 40000], staff: [2, 8], margin: [35, 55],
               unitCost: [40, 200], unitPrice: [150, 900], daily: [6, 40],
               licenses: ['Shop & Establishment Act', 'GST Registration', 'Udyam Registration (MSME)', 'Professional Tax'],
               peak: ['month-end', 'exam / event season', 'weekend', 'festival week'],
               raw: ['consumables aur supplies', 'spare parts / material', 'software / subscription', 'packaging'],
               equip: ['workstation / tools', 'computer + billing software', 'storage rack', 'customer seating'],
               staffRoles: ['skilled technician / trainer', 'helper', 'front office person', 'marketing person'],
               risks: ['skilled staff ka job chhod dena', 'client payment delay', 'competition se rate war', 'referral ruk jana'],
               kpi: ['clients per month', 'repeat client %', 'utilisation hours', 'average ticket size'],
               hygiene: ['workstation roz saaf', 'tools sterilise / maintain', 'waiting area presentable rakho', 'waste daily disposal'],
               seasonal: ['financial year end', 'exam season', 'wedding season', 'new admission cycle']
             },
    retail:  { setup: [150000, 900000], rent: [15000, 70000], staff: [2, 7], margin: [12, 28],
               unitCost: [100, 800], unitPrice: [130, 1000], daily: [10, 80],
               licenses: ['Shop & Establishment Act', 'GST Registration', 'Udyam Registration (MSME)', 'Local Trade License'],
               peak: ['month ki 1 se 10 tareekh', 'festival week', 'weekend', 'salary day'],
               raw: ['stock / inventory', 'packaging material', 'billing consumables'],
               equip: ['racks aur display', 'billing + POS software', 'CCTV', 'weighing scale / counter'],
               staffRoles: ['shop manager', 'sales / counter staff', 'stock keeping person', 'delivery / helper'],
               risks: ['dead stock fasna', 'credit (udhaar) badhna', 'online price competition', 'theft / shrinkage'],
               kpi: ['daily footfall', 'conversion %', 'inventory turnover', 'average bill value'],
               hygiene: ['shelves ki daily dusting', 'expired stock weekly check', 'store front saaf + lit', 'trial area sanitize'],
               seasonal: ['Diwali', 'Rakhi / festival', 'New Year sale', 'school/college season']
             },
    generic: { setup: [80000, 600000], rent: [10000, 50000], staff: [2, 8], margin: [25, 48],
               unitCost: [50, 300], unitPrice: [150, 900], daily: [8, 60],
               licenses: ['Shop & Establishment Act', 'GST Registration', 'Udyam Registration (MSME)', 'Local Trade License'],
               peak: ['weekend', 'month-end', 'festival week', 'evening 6–9 pm'],
               raw: ['core raw material', 'packaging', 'consumables'],
               equip: ['core machinery / tools', 'billing software', 'storage', 'power backup'],
               staffRoles: ['skilled operator', 'helper', 'counter person'],
               risks: ['demand ka fluctuate hona', 'raw material rate', 'staff turnover', 'competition'],
               kpi: ['daily output', 'per-unit profit', 'repeat customer %', 'cost per unit'],
               hygiene: ['work area roz saaf', 'tools maintain', 'waste daily disposal', 'staff hygiene protocol'],
               seasonal: ['festival season', 'wedding season', 'summer', 'monsoon']
             }
  };

  /* ---- Specific items (rich metadata) ---- */
  const KB = {
    samosa:   { type:'food', emoji:'🥟', name:'Samosa', unitName:'piece', unitCost:[3,8], unitPrice:[10,25], daily:[250,900], setup:[40000,160000],
                raw:['aloo','maida','besan','tel','hara masala','hari mirch','dhaniya','saunf'],
                equip:['badi kadhai + burner','gas connection','samosa mould ya machine','display warmer','steel trays'],
                peak:['shaam 5 se 9 baje tak','subah 9 se 11 baje tak'],
                kpi:['daily samose','per-piece profit','tel kitni baar badla','bakaya samose %'] },
    idli:     { type:'food', emoji:'🍚', name:'Idli', unitName:'idli', unitCost:[4,9], unitPrice:[15,40], daily:[300,1200], setup:[50000,200000],
                raw:['idli rice (ukda chawal)','urad dal','methi dana','namak','coconut (chutney)','nariyal'],
                equip:['idli steamer (4-6 tier)','wet grinder','fermentation vessel','chutney grinder','banana leaves / plates'],
                peak:['subah 6 se 10 baje tak','shaam 5 se 8 baje tak'],
                kpi:['daily idli count','batter waste %','chutney consistency','subah ka rush handle time'] },
    dosa:     { type:'food', emoji:'🥞', name:'Dosa', unitName:'dosa', unitCost:[8,20], unitPrice:[30,90], daily:[120,500], setup:[80000,280000],
                raw:['idli rice','urad dal','tel/ghee','aloo','pyaaz','masala','sambar ingredients'],
                equip:['tawa (cast iron)','wet grinder','tawa burner (high pressure)','stainless counter','sambar vessel'],
                peak:['subah 7 se 11 baje tak','shaam 6 se 10 baje tak'],
                kpi:['dosa per hour capacity','tawa temperature control','order-to-serve time','masala dosa vs plain ratio'] },
    chai:     { type:'food', emoji:'☕', name:'Chai', unitName:'cup', unitCost:[4,9], unitPrice:[10,30], daily:[300,1500], setup:[25000,90000],
                raw:['chai patti','doodh','cheeni','elaichi','adrak','kulhad / paper cup'],
                equip:['chai boiler / patila','gas ya induction','kulhad stock','small display shelf','cash box / UPI stand'],
                peak:['subah 6 se 10 baje tak','shaam 4 se 8 baje tak'],
                kpi:['daily cups','doodh waste %','repeat customer %','peak hour service speed'] },
    momos:    { type:'food', emoji:'🥟', name:'Momos', unitName:'plate', unitCost:[12,28], unitPrice:[40,90], daily:[80,350], setup:[45000,170000],
                raw:['maida','patta gobhi','gajar','pyaaz','soy chunks / chicken','chutney material','spring onion'],
                equip:['steamer','dough kneader','steel counter','chutney blender','gas burner'],
                peak:['shaam 5 se 10 baje tak','raat 9 baje ke baad'],
                kpi:['daily plates','steamer batch time','chutney quality score','veg vs non-veg ratio'] },
    poha:     { type:'food', emoji:'🍛', name:'Poha', unitName:'plate', unitCost:[6,14], unitPrice:[20,50], daily:[150,600], setup:[35000,130000],
                raw:['poha (thick/medium)','pyaaz','aloo','haldi','jeera','nimbu','sev','dhaniya'],
                equip:['badi kadhai','gas burner','steel plates','display counter','storage bins'],
                peak:['subah 6:30 se 10:30 tak'],
                kpi:['daily plates','subah 2 ghante ka output','sev/nimbu wastage','per-plate cost'] },
    jalebi:   { type:'food', emoji:'🍩', name:'Jalebi', unitName:'kg', unitCost:[90,160], unitPrice:[220,400], daily:[15,60], setup:[50000,180000],
                raw:['maida','besan','cheeni','tel/ghee','dahi (fermentation)','kesar'],
                equip:['jalebi kadhai (flat)','gas burner','chaashni vessel','fermentation tub','weighing scale'],
                peak:['subah 7 se 10 baje tak','shaam 5 se 9 baje tak','festival subah'],
                kpi:['daily kg','chaashni consistency','oil absorption %','festival day volume'] },
    biryani:  { type:'food', emoji:'🍛', name:'Biryani', unitName:'plate', unitCost:[70,160], unitPrice:[180,450], daily:[40,200], setup:[120000,500000],
                raw:['basmati rice','chicken/mutton','dahi','pyaaz','biryani masala','ghee','pudina','kesar'],
                equip:['handi / deg','bhatti (heavy burner)','dum sealing setup','rice cooker','packaging (aluminium foil boxes)'],
                peak:['dopahar 12 se 3 baje tak','raat 8 se 11 baje tak','weekend'],
                kpi:['daily plates','per-plate food cost %','dum consistency','delivery time'] },
    chaat:    { type:'food', emoji:'🥗', name:'Chaat', unitName:'plate', unitCost:[10,25], unitPrice:[30,80], daily:[120,450], setup:[40000,150000],
                raw:['papdi','aloo','chana','dahi','imli chutney','pudina chutney','sev','masala'],
                equip:['chaat counter (glass)','chutney containers','steel utensils','gas burner (for tikki)','display trays'],
                peak:['shaam 4 se 9 baje tak'],
                kpi:['daily plates','chutney freshness','plate assembly time','waste of papdi'] },
    icecream: { type:'food', emoji:'🍨', name:'Ice Cream', unitName:'cup', unitCost:[12,35], unitPrice:[40,150], daily:[60,300], setup:[150000,700000],
                raw:['doodh / cream','cheeni','flavour base','cone / cup','chocolate','dry fruits'],
                equip:['deep freezer (-18°C)','ice cream machine / softy machine','generator (critical)','display freezer','scoops + tools'],
                peak:['shaam 5 se 10 baje tak','summer afternoon','weekend'],
                kpi:['daily cups/scoops','electricity bill per day','melting waste %','flavour popularity'] },
    juice:    { type:'food', emoji:'🧃', name:'Juice / Shake', unitName:'glass', unitCost:[12,30], unitPrice:[40,120], daily:[80,350], setup:[60000,250000],
                raw:['seasonal fruit','doodh','cheeni','ice','cup + straw','nimbu'],
                equip:['juicer / blender (commercial)','ice crusher','fruit display','deep freezer','water purifier + RO'],
                peak:['dopahar 12 se 5 baje tak','shaam 6 se 9 baje tak','summer'],
                kpi:['daily glasses','fruit spoilage %','seasonal menu switch','per-glass cost'] },
    bakery:   { type:'food', emoji:'🍞', name:'Bakery', unitName:'item', unitCost:[15,80], unitPrice:[40,250], daily:[80,400], setup:[250000,1200000],
                raw:['maida','butter/margarine','cheeni','anda','yeast','chocolate','cream','dry fruits'],
                equip:['deck oven','proofer','planetary mixer','display chiller','dough divider'],
                peak:['subah 7 se 10 baje tak','shaam 5 se 9 baje tak','festival + birthday orders'],
                kpi:['daily sales','unsold/stale %','oven batch capacity','custom order margin'] },
    sweets:   { type:'food', emoji:'🍬', name:'Mithai (Sweets)', unitName:'kg', unitCost:[180,420], unitPrice:[400,900], daily:[20,120], setup:[300000,1500000],
                raw:['doodh','khoya','cheeni','ghee','dry fruits','kesar','besan'],
                equip:['bhatti + kadhai set','khoya machine','cold storage','display counter (lit)','weighing scale'],
                peak:['festival week','shaadi season','Diwali (5-10x volume)'],
                kpi:['daily kg','khoya quality','festival advance orders','shelf life loss %'] },
    tiffin:   { type:'food', emoji:'🍱', name:'Tiffin Service', unitName:'tiffin', unitCost:[35,70], unitPrice:[80,180], daily:[40,250], setup:[60000,250000],
                raw:['daily sabzi material','rice','dal','atta','packaging containers','disposable cutlery'],
                equip:['commercial kitchen','tiffin box set (200+)','delivery bag/box','2-wheeler','subscription register / app'],
                peak:['dopahar 11 se 1 baje tak','raat 7 se 9 baje tak','month start (subscriptions)'],
                kpi:['active subscribers','churn per month','per-tiffin cost','delivery on-time %'] },

    hotel:    { type:'place', emoji:'🏨', name:'Hotel', unitName:'room-night', unitCost:[400,1200], unitPrice:[1200,4500], daily:[10,80],
                setup:[800000,4000000], rent:[60000,300000],
                raw:['linen + towels','toiletries/amenities','housekeeping chemicals','kitchen raw material','maintenance spares'],
                equip:['furniture + fittings','laundry setup','CCTV + keycard system','PMS (property management software)','power backup / generator'],
                peak:['weekend (Fri–Sun)','wedding season','festival week','corporate bookings'],
                kpi:['occupancy %','ADR (avg daily rate)','RevPAR','housekeeping cost per room','OTA commission %'],
                hygiene:['room checklist har checkout pe','linen change protocol','washroom deep clean daily','pest control monthly','corridor + lobby 2 baar daily'] },
    restaurant:{type:'place', emoji:'🍽️', name:'Restaurant', unitName:'bill', unitCost:[120,400], unitPrice:[400,1600], daily:[40,250],
                setup:[500000,3000000], rent:[40000,200000],
                raw:['fresh vegetables','meat/dairy','grains + spices','beverages','packaging (delivery)'],
                equip:['commercial kitchen line','exhaust + chimney','cooling (deep freezer + chiller)','POS + KOT printer','furniture + interiors'],
                peak:['dopahar 12 se 3:30 tak','raat 7:30 se 11 tak','weekend dinner'],
                kpi:['average bill value','table turnover','food cost %','staff cost %','Zomato/Swiggy rating'] },
    cafe:     { type:'place', emoji:'🫖', name:'Cafe', unitName:'bill', unitCost:[60,180], unitPrice:[200,700], daily:[50,250],
                setup:[300000,1500000], rent:[25000,120000],
                raw:['coffee beans','doodh','syrups','bakery items','snacks','cups + lids'],
                equip:['espresso machine','grinder','milk fridge','pastry display','wifi + power points (seating value)'],
                peak:['subah 9 se 11','dopahar 3 se 6','raat 8 se 11','weekend'],
                kpi:['daily bills','avg sitting time','coffee cost per cup','repeat visitor %','instagrammable orders'] },
    gym:      { type:'place', emoji:'🏋️', name:'Gym', unitName:'member', unitCost:[150,400], unitPrice:[800,2500], daily:[40,300],
                setup:[800000,3500000], rent:[30000,150000],
                raw:['equipment maintenance','sanitiser + towels','protein/supplement stock','music + AC cost'],
                equip:['free weights + racks','cardio machines','rubber flooring','mirrors','biometric entry'],
                peak:['subah 5 se 9','shaam 5 se 10','New Year (Jan) spike'],
                kpi:['active members','retention %','peak-hour crowding','trainer cost %','annual plan share'] },
    salon:    { type:'service', emoji:'💇', name:'Salon / Parlour', unitName:'service', unitCost:[40,180], unitPrice:[150,1500], daily:[10,60],
                setup:[200000,1200000], rent:[15000,80000],
                raw:['hair colour + chemicals','shampoo/conditioner','disposables (cape, towel)','waxing material'],
                equip:['styling chairs + mirrors','hair dryer / steamer','steriliser','washing station','waiting sofa'],
                peak:['weekend','shaadi season','festival se 1 hafta pehle'],
                kpi:['services per day','avg ticket','stylist utilisation %','product retail share','walk-in vs appointment'] },
    tuition:  { type:'service', emoji:'📚', name:'Coaching / Tuition', unitName:'student', unitCost:[200,700], unitPrice:[800,4000], daily:[20,300],
                setup:[100000,800000], rent:[12000,70000],
                raw:['study material / printouts','whiteboard + markers','test papers','online platform subscription'],
                equip:['benches + desks','whiteboard / smart board','CCTV (parents trust)','AC / cooler','attendance system'],
                peak:['naya session (April–June)','board exam se pehle','result ke baad admission rush'],
                kpi:['active students','fee collection %','batch strength','result / rank rate','referral admissions'] },
    kirana:   { type:'retail', emoji:'🛒', name:'Kirana Store', unitName:'bill', unitCost:[400,1200], unitPrice:[450,1400], daily:[60,300],
                setup:[200000,1000000], rent:[12000,60000],
                raw:['FMCG stock (distributor)','packaging','billing rolls','home delivery bags'],
                equip:['racks + gondola','weighing scale','POS + UPI QR','CCTV','deep freezer (beverage/dairy)'],
                peak:['subah 7 se 10','shaam 6 se 10','month ki 1-7 tareekh (salary)'],
                kpi:['daily bills','avg bill value','dead stock %','udhaar outstanding','home delivery orders'] },
    medical:  { type:'retail', emoji:'💊', name:'Medical Store', unitName:'bill', unitCost:[200,900], unitPrice:[250,1100], daily:[50,250],
                setup:[300000,1500000], rent:[15000,80000],
                raw:['medicine stock','surgical/disposables','cold chain (vaccine/insulin)','prescription register'],
                equip:['medicine racks (alphanumeric)','refrigerator (2–8°C)','POS + drug licence records','weighing scale'],
                peak:['subah 10 se 1','shaam 6 se 10','monsoon + winter (seasonal illness)'],
                kpi:['daily bills','expiry loss %','near-hospital footfall','chronic patient repeat rate'] },
    mobileshop:{type:'retail', emoji:'📱', name:'Mobile Shop', unitName:'unit', unitCost:[4000,18000], unitPrice:[4500,20000], daily:[2,20],
                setup:[400000,2000000], rent:[20000,100000],
                raw:['handset stock','accessories (case/charger)','screen guards','repair spares'],
                equip:['glass display counter','demo units','repair tools + hot air gun','CCTV + locker','EMI/finance tie-up'],
                peak:['festival (Diwali)','naya launch week','month-end (EMI approvals)'],
                kpi:['units sold/month','accessory attach rate','repair service revenue','finance approval %'] },
    printing: { type:'service', emoji:'🖨️', name:'Printing / Xerox', unitName:'job', unitCost:[20,150], unitPrice:[60,600], daily:[20,120],
                setup:[150000,800000], rent:[8000,35000],
                raw:['paper (GSM variety)','toner / ink','binding material','lamination sheets'],
                equip:['digital printer','photocopier','lamination + spiral machine','cutting machine','design PC'],
                peak:['exam season','financial year end','shaadi card season'],
                kpi:['pages/day','paper wastage %','repeat corporate clients','bulk order margin'] },
    laundry:  { type:'service', emoji:'🧺', name:'Laundry / Dry Cleaning', unitName:'garment', unitCost:[12,60], unitPrice:[40,250], daily:[60,300],
                setup:[200000,1000000], rent:[10000,50000],
                raw:['detergent + chemicals','steam + water','packaging (plastic cover)','tag/thread'],
                equip:['commercial washing machine','dry cleaning machine','steam press','drying rack','delivery van'],
                peak:['winter (heavy clothes)','wedding season','Monday (weekend pile-up)'],
                kpi:['garments/day','per-garment cost','damage complaint %','hotel/hostel B2B contracts'] },
    tailoring:{ type:'service', emoji:'🧵', name:'Tailoring / Boutique', unitName:'stitch', unitCost:[60,250], unitPrice:[250,1500], daily:[5,40],
                setup:[80000,500000], rent:[8000,45000],
                raw:['fabric (customer ya in-house)','thread + buttons','lining + zip','packaging covers'],
                equip:['stitching machines (2-4)','overlock machine','press/iron table','trial room','measuring tools'],
                peak:['shaadi season','festival se 3 hafta pehle','Diwali rush'],
                kpi:['stitches/day','alteration rework %','fabric sales margin','deadline on-time %'] },
    dairy:    { type:'retail', emoji:'🥛', name:'Dairy / Milk Booth', unitName:'litre', unitCost:[38,52], unitPrice:[48,70], daily:[150,800],
                setup:[150000,800000], rent:[8000,35000],
                raw:['daily milk supply','curd/paneer stock','bread + FMCG add-ons','cold storage'],
                equip:['deep freezer / visicooler','weighing + measuring','billing counter','insulated crates','generator'],
                peak:['subah 6 se 9','shaam 5 se 8'],
                kpi:['daily litres','spoilage %','add-on product share','subscriber count'] },
    nursery:  { type:'retail', emoji:'🪴', name:'Plant Nursery', unitName:'plant', unitCost:[25,180], unitPrice:[60,600], daily:[15,120],
                setup:[150000,900000], rent:[10000,60000],
                raw:['saplings / seeds','soil + cocopeat','pots + planters','fertiliser + pesticide'],
                equip:['shade net / greenhouse','irrigation setup','potting area','transport crates'],
                peak:['monsoon (planting season)','Diwali','New Year'],
                kpi:['plants sold/month','mortality %','landscaping project revenue','repeat buyer %'] },
    events:   { type:'service', emoji:'🎉', name:'Event Management', unitName:'event', unitCost:[15000,120000], unitPrice:[40000,400000], daily:[0.2,3],
                setup:[200000,1500000], rent:[15000,60000],
                raw:['decor material','lighting + sound rental','catering vendor','photography vendor'],
                equip:['own decor inventory','sound/light stock (ya rental tie-up)','transport vehicle','project planning software'],
                peak:['wedding season (Nov–Feb)','corporate year-end','festival'],
                kpi:['events/month','margin per event','vendor reliability','advance payment %'] }
  };

  /* Keyword inference for anything not in KB */
  const TYPE_KEYWORDS = {
    food:    ['food','khana','snack','chai','tea','coffee','pizza','burger','noodle','roll','paratha','kachori','vada','pav','bhelpuri','samosa','sweets','mithai','cake','bread','juice','shake','lassi','panipuri','paan','egg','omelette','thali','bhojanalaya','dhaba','catering','pickle','achar','papad','masala','flour','chakki','namkeen','farsan','biryani','kebab','tandoor','ice','kulfi','falooda','soup','salad','sandwich','waffle','pancake','nasta','breakfast','lunch','dinner'],
    place:   ['hotel','restaurant','cafe','resort','lodge','dharamshala','guest house','banquet','gym','spa','salon','cinema','clinic','hospital','hostel','pg','marriage hall','auditorium','play school','crèche','water park','amusement','bar','pub','lounge','kitchen','canteen','mess','farmhouse','tent house','warehouse','godown','office','studio'],
    service: ['service','repair','tailor','stitching','boutique','laundry','dryclean','cleaning','pest','coaching','tuition','classes','academy','institute','training','driving','photography','video','makeup','mehndi','carpenter','electrician','plumber','painting','interior','architect','ca','tax','insurance','agent','courier','transport','travels','tour','event','wedding','beauty','grooming','physio','diagnostic','lab','vet','pet','nursing','maid','security','consultant','software','web','digital marketing','editing','printing','typing','translation','astrology'],
    retail:  ['shop','store','kirana','mart','medical','pharmacy','mobile','electronics','clothes','garment','saree','kurta','shoe','footwear','jewellery','jewelers','optical','book','stationery','toys','furniture','hardware','paint','cement','steel','utensil','sports','gift','flower','grocery','vegetable','fruit','fish','meat','dairy','bakery','supermarket','mall','showroom','boutique','watch','perfume','cosmetic','sanitary','tile','marble','curtain','carpet','mattress','luggage','cycle','bike','car','spare parts','battery','solar','led','appliance','fridge','washing machine','gadget','computer','laptop']
  };

  const GUESS_EMOJI = {
    food:'🍽️', place:'🏢', service:'🛠️', retail:'🛍️', generic:'💡'
  };

  function inferType(q) {
    const s = q.toLowerCase();
    for (const k in KB) if (s.includes(k)) return KB[k].type;
    for (const t of ['food','place','service','retail'])
      for (const w of TYPE_KEYWORDS[t]) if (s.includes(w)) return t;
    return 'generic';
  }

  function titleCase(s) {
    return s.replace(/\b[a-z]/g, c => c.toUpperCase());
  }

  /* Hindi display names (Devanagari) for common items */
  const HINDI = {
    samosa:'समोसा', idli:'इडली', dosa:'डोसा', chai:'चाय', momos:'मोमोज़', poha:'पोहा',
    jalebi:'जलेबी', biryani:'बिरयानी', chaat:'चाट', icecream:'आइसक्रीम', juice:'जूस',
    bakery:'बेकरी', sweets:'मिठाई', tiffin:'टिफ़िन', hotel:'होटल', restaurant:'रेस्टोरेंट',
    cafe:'कैफ़े', gym:'जिम', salon:'सैलून', tuition:'ट्यूशन', kirana:'किराना', medical:'मेडिकल',
    mobileshop:'मोबाइल शॉप', printing:'प्रिंटिंग', laundry:'लॉन्ड्री', tailoring:'टेलरिंग',
    dairy:'डेयरी', nursery:'नर्सरी', events:'इवेंट'
  };

  /* Build a fully-resolved topic object from any user input */
  function resolveTopic(query) {
    const q = (query || '').trim();
    const key = q.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    let base = null, matchedKey = key;
    for (const k in KB) {
      if (key === k || key.includes(k) || k.includes(key)) { base = KB[k]; matchedKey = k; break; }
    }
    const type = base ? base.type : inferType(q);
    const d = TYPE_DEFAULTS[type];
    const t = {
      key: matchedKey,
      query: q,
      name: base ? base.name : titleCase(q || 'Business'),
      type,
      emoji: base ? base.emoji : GUESS_EMOJI[type],
      unitName: base && base.unitName ? base.unitName : (type === 'food' ? 'item' : type === 'retail' ? 'bill' : 'order'),
      unitCost: base && base.unitCost ? base.unitCost : d.unitCost,
      unitPrice: base && base.unitPrice ? base.unitPrice : d.unitPrice,
      daily: base && base.daily ? base.daily : d.daily,
      setup: base && base.setup ? base.setup : d.setup,
      rent: base && base.rent ? base.rent : d.rent,
      staff: d.staff,
      margin: d.margin,
      licenses: d.licenses.slice(),
      peak: base && base.peak ? base.peak : d.peak,
      raw: base && base.raw ? base.raw : d.raw,
      equip: base && base.equip ? base.equip : d.equip,
      staffRoles: d.staffRoles,
      risks: d.risks,
      kpi: base && base.kpi ? base.kpi : d.kpi,
      hygiene: base && base.hygiene ? base.hygiene : d.hygiene,
      seasonal: d.seasonal
    };
    if (base && base.staff) t.staff = base.staff;
    if (base && base.margin) t.margin = base.margin;
    t.hindi = HINDI[t.key] || t.name;
    return t;
  }

  /* ================= REGIONS (area personalisation) ==================== */
  const REGIONS = {
    'chhattisgarh': { label:'Chhattisgarh', city:'Raipur', cities:['Raipur','Bilaspur','Bhilai','Durg','Korba'],
      flavour:['Chhattisgarh me log nasta me poha–jalebi bahut pasand karte hain','CG me shaadi ka season Nov–Feb sabse strong hota hai','Raipur–Bhilai belt me industrial crowd hai, isliye tiffin aur budget hotel ki demand rehti hai'],
      festivals:['Hareli','Pola','Diwali','Navratri'], note:'CG me property rates tier-2 cities me kaafi reasonable hain — kam rent me bada space mil jata hai.' },
    'madhya pradesh': { label:'Madhya Pradesh', city:'Indore', cities:['Indore','Bhopal','Gwalior','Jabalpur','Ujjain'],
      flavour:['MP me subah ka nasta culture bahut strong hai — poha, jalebi, sabudana khichdi bikta hai','Indore ka Sarafa night food market poore India me famous hai — raat 10 baje ke baad ka crowd real hai','Ujjain/Mahakal ki wajah se religious tourism ka flow rehta hai, hotel occupancy stable rehti hai'],
      festivals:['Simhasth','Ganesh Utsav','Diwali','Navratri'], note:'MP me Indore business-friendly city hai — municipal permissions relatively smooth hain.' },
    'maharashtra': { label:'Maharashtra', city:'Pune', cities:['Mumbai','Pune','Nagpur','Nashik','Aurangabad'],
      flavour:['Maharashtra me vada pav, misal pav aur poha sabse zyada bikne wale items hain','Pune me student + IT crowd hai, cafe aur tiffin service ki demand high hai','Mumbai me rent bahut zyada hai — isliye cloud kitchen / small kiosk model better rehta hai'],
      festivals:['Ganesh Utsav (sabse bada)','Gudi Padwa','Diwali'], note:'Ganesh Utsav ke 10 din catering aur food stalls ka business 3–5x ho jata hai.' },
    'delhi': { label:'Delhi NCR', city:'Delhi', cities:['Delhi','Noida','Gurgaon','Ghaziabad','Faridabad'],
      flavour:['Delhi me chaat, momos aur rolls ka market bahut bada hai','Noida/Gurgaon me corporate crowd hai — tiffin aur cafe chalta hai','Delhi me rent high hai, isliye food truck / kiosk model se shuru karna samajhdari hai'],
      festivals:['Diwali','Chhath','New Year'], note:'Delhi me FSSAI + MCD license strict hai, pehle paperwork clear karo.' },
    'uttar pradesh': { label:'Uttar Pradesh', city:'Lucknow', cities:['Lucknow','Kanpur','Varanasi','Noida','Agra'],
      flavour:['UP me chaat, samosa aur mithai ka market bahut strong hai','Varanasi me tourism ki wajah se hotel aur ghat-side food chalta hai','Lucknow ka awadhi khana (biryani, kebab) premium price leta hai'],
      festivals:['Ram Navami','Diwali','Eid'], note:'UP me labour cost comparatively kam hai — staff cost advantage milta hai.' },
    'gujarat': { label:'Gujarat', city:'Ahmedabad', cities:['Ahmedabad','Surat','Vadodara','Rajkot'],
      flavour:['Gujarat me farsan (khakhra, gathiya, fafda) ka business bahut chalta hai','Surat me textile market hai — retail aur wholesale dono strong hain','Gujarat me log business-minded hain, franchise model jaldi pick hota hai'],
      festivals:['Navratri (9 din ka huge demand)','Uttarayan','Diwali'], note:'Navratri ke 9 din food stalls aur event management ka peak season hota hai.' },
    'rajasthan': { label:'Rajasthan', city:'Jaipur', cities:['Jaipur','Jodhpur','Udaipur','Kota'],
      flavour:['Rajasthan me tourism heavy hai — hotel, cafe aur handicraft retail chalta hai','Jaipur me wedding season me banquet + catering ka demand 3x ho jata hai','Kota me coaching industry hai — tiffin, PG aur stationery ka market huge hai'],
      festivals:['Teej','Gangaur','Diwali'], note:'Tourist areas me seasonality zyada hai — off-season ka plan pehle banao.' },
    'karnataka': { label:'Karnataka', city:'Bengaluru', cities:['Bengaluru','Mysuru','Mangaluru','Hubballi'],
      flavour:['Karnataka me idli, dosa aur filter coffee ka market sabse strong hai','Bengaluru me IT crowd hai — cafe, gym aur cloud kitchen ka demand high hai','Mysuru me tourism ki wajah se hotel occupancy stable rehti hai'],
      festivals:['Dasara','Ugadi','Deepavali'], note:'Bengaluru me rent zyada hai lekin paying capacity bhi high hai — premium pricing possible hai.' },
    'tamil nadu': { label:'Tamil Nadu', city:'Chennai', cities:['Chennai','Coimbatore','Madurai','Salem'],
      flavour:['TN me idli, dosa aur filter coffee daily need hai — volume business hai','Chennai me tiffin centre aur bakery ka market bahut bada hai','Coimbatore me textile + manufacturing crowd hai, budget hotel chalta hai'],
      festivals:['Pongal','Diwali','Tamil New Year'], note:'TN me breakfast business subah 6–10 baje ke 4 ghante pe depend karta hai — speed critical hai.' },
    'west bengal': { label:'West Bengal', city:'Kolkata', cities:['Kolkata','Howrah','Durgapur','Siliguri'],
      flavour:['Bengal me mishti (sweets) aur street food (puchka, rolls) ka market huge hai','Kolkata me Durga Puja ke 5 din business 4–6x ho jata hai','Siliguri/North Bengal me tourism ki wajah se hotel demand hai'],
      festivals:['Durga Puja (sabse bada)','Kali Puja','Poila Boishakh'], note:'Durga Puja pandal-hopping crowd ke liye food stall golden opportunity hai.' },
    'bihar': { label:'Bihar', city:'Patna', cities:['Patna','Gaya','Muzaffarpur','Bhagalpur'],
      flavour:['Bihar me litti chokha, samosa aur chaat ka market strong hai','Patna me coaching + student crowd hai — tiffin aur PG chalta hai','Rent aur labour cost kam hai — low investment me shuru kar sakte ho'],
      festivals:['Chhath (sabse bada)','Diwali','Holi'], note:'Chhath ke time prasad/sweets ka demand bahut zyada hota hai.' },
    'punjab': { label:'Punjab', city:'Ludhiana', cities:['Ludhiana','Amritsar','Jalandhar','Chandigarh'],
      flavour:['Punjab me dhaba culture strong hai — paratha, lassi, tandoori items bikte hain','Amritsar me Golden Temple tourism ki wajah se hotel + food demand stable hai','Ludhiana me industrial crowd hai — tiffin service chalta hai'],
      festivals:['Baisakhi','Lohri','Diwali'], note:'Punjab me portion size expectation bada hai — pricing usi hisaab se karo.' },
    'telangana': { label:'Telangana', city:'Hyderabad', cities:['Hyderabad','Warangal','Nizamabad'],
      flavour:['Hyderabad me biryani ka market poore India me sabse competitive + biggest hai','Hyderabad me Irani chai + Osmania biscuit ka culture unique hai','IT corridor (Hitec City) me cafe aur cloud kitchen chalta hai'],
      festivals:['Bonalu','Bathukamma','Ramzan'], note:'Hyderabad me biryani me brand trust sabse important hai — consistency > marketing.' },
    'kerala': { label:'Kerala', city:'Kochi', cities:['Kochi','Trivandrum','Kozhikode','Thrissur'],
      flavour:['Kerala me breakfast (puttu, appam, idli) daily volume business hai','Kochi me tourism + IT dono hai — homestay aur cafe chalta hai','Gulf returnees ka investment flow hai — premium concepts chalte hain'],
      festivals:['Onam (sabse bada)','Vishu','Christmas'], note:'Onam season me catering (sadya) ka demand bahut zyada hota hai.' }
  };

  function resolveRegion(text) {
    const s = (text || '').toLowerCase().trim();
    if (!s) return null;
    for (const k in REGIONS) {
      const r = REGIONS[k];
      if (s.includes(k)) return r;
      for (const c of r.cities) if (s.includes(c.toLowerCase())) return r;
    }
    // Unknown place -> treat as generic locality
    return { label: titleCase(text), city: titleCase(text), cities: [titleCase(text)],
      flavour: [text + ' ke local market ke hisaab se pricing set karo — tier-2/tier-3 me price sensitivity zyada hoti hai'],
      festivals: ['Diwali','New Year'], note: 'Apne ilake ke 2 km radius ka survey khud karo — wahi asli data hai.' };
  }

  /* ================= TEXT BUILDING BLOCKS ============================== */
  const OPENERS = {
    food: [
      '{N} ka business chhote investment me shuru ho jata hai, par chalta wahi hai jiska hisaab pakka ho.',
      '{N} me asli paisa volume me hai — per-piece profit chhota hota hai, isliye roz ki quantity matter karti hai.',
      '{N} ka business chalana easy lagta hai, par 90% log pehle 6 mahine me band kar dete hain. Wajah? Numbers ka pata nahi hota.',
      '{N} me entry barrier kam hai — matlab competition zyada. Jo consistency deta hai, wahi bachta hai.'
    ],
    place: [
      '{N} ek asset-heavy business hai — yahan fixed cost zyada hai, isliye occupancy/utilisation hi profit decide karta hai.',
      '{N} me customer sirf service nahi kharidta, experience kharidta hai. Chhoti cheezein hi review decide karti hain.',
      '{N} chalane me asli challenge sales nahi, daily operations discipline hai.',
      '{N} me investment bada hota hai lekin recurring revenue bhi stable hota hai — agar systems sahi ho.'
    ],
    service: [
      '{N} me sabse bada asset aapka skilled staff hai — wahi customer ko wapas laata hai.',
      '{N} ek trust-based business hai — ek galti ka nuksaan 10 acche kaam se zyada hota hai.',
      '{N} me margin accha hai, par capacity limited hai. Isliye pricing aur utilisation dono important hain.',
      '{N} me referral hi asli marketing hai — service quality hi aapka ad budget hai.'
    ],
    retail: [
      '{N} me paisa stock me phasa rehta hai — isliye inventory turnover hi asli game hai.',
      '{N} me margin per-unit chhota hota hai, profit footfall aur repeat customer se banta hai.',
      '{N} me online competition se ladna hai toh service + availability se lado, price se nahi.',
      '{N} me dead stock sabse bada silent killer hai — jo bikta nahi wo rent kha jaata hai.'
    ],
    generic: [
      '{N} ka business shuru karna aasan hai, tikana mushkil — difference sirf systems ka hai.',
      '{N} me pehle unit economics samjho, phir scale ki baat karo.',
      '{N} me consistency > marketing. Roz wahi quality, wahi time, wahi behaviour.',
      '{N} me chhoti daily cheezein hi 6 mahine baad bada result banati hain.'
    ]
  };

  const CTAS = [
    'Aaj hi ek register banao aur 30 din tak daily numbers likho — 31ve din aapko khud pata chal jayega ki kya theek karna hai.',
    'Ek week tak sirf observe karo, koi decision mat lo. Data aane do.',
    'Apne 5 regular customers se seedha pucho: "kya ek cheez badalni ho toh kya?" Jawab hi aapka roadmap hai.',
    'Jo bhi seekha, use likh lo. Jo likha nahi gaya wo dobara galti banke aata hai.',
    'Chhota experiment karo — 7 din, chhota budget. Result dekhte hi scale karo.',
    'Ek competitor ke paas customer bankar jao. Uska rate, timing aur behaviour note karo.'
  ];

  const MYTHS = [
    { m: '"Location acchi ho toh business apne aap chal jata hai."', r: 'Location sirf first visit laata hai. Repeat customer sirf quality + behaviour se aata hai.' },
    { m: '"Rate kam rakho toh zyada customer aayenge."', r: 'Rate kam karne se crowd aata hai, profit nahi. Value badhao, rate apne aap sustain hoga.' },
    { m: '"Pehle bada setup karo, phir customer aayenge."', r: 'Chhote shuru karo, demand prove karo, phir invest karo. Ulti sequence sabse common failure hai.' },
    { m: '"Staff mil jayega, training baad me dekhenge."', r: 'Bina training ka staff aapka brand kharab karta hai. Pehle SOP banao, phir hiring.' },
    { m: '"Online marketing se sab ho jata hai."', r: 'Online sirf awareness deta hai. Conversion in-store experience se hota hai.' },
    { m: '"Mera product accha hai toh review ki zaroorat nahi."', r: 'Aaj ka customer pehle Google rating dekhta hai. Review manage karna daily kaam hai.' },
    { m: '"Udhaar se customer tikta hai."', r: 'Udhaar customer ko nahi, cash flow ko maar deta hai. Limit + register zaroori hai.' }
  ];

  const HABITS = [
    'Roz dukaan/band hone se pehle 10 minute ka closing checklist follow karo',
    'Daily ka sales, kharcha aur waste — teen numbers register me likho',
    'Har customer complaint ko same day address karo, chahe chhoti ho',
    'Staff ko hafte me ek baar 30 minute training do',
    'Har mahine ke last din stock aur cash ka physical count lo',
    'Har 15 din me competitor ke rate check karo',
    'Top 10 customers ka record rakho aur unhe personally yaad rakho',
    'Har naya idea pehle 7 din ka chhota experiment banao'
  ];

  /* ================= PILLARS =========================================== */
  /* Har pillar ek post banata hai: {tag, title, blocks[], audio, slides}  */

  function ctxFor(t, region, r) {
    return { t, region, r,
      N: t.name, n: t.name.toLowerCase(),
      dailyAvg: Math.round((t.daily[0] + t.daily[1]) / 2),
      unitCostAvg: (t.unitCost[0] + t.unitCost[1]) / 2,
      unitPriceAvg: (t.unitPrice[0] + t.unitPrice[1]) / 2
    };
  }

  const P = {};

  /* ---- 1. Core business idea ---- */
  P.idea = function (c) {
    const { t, r, region } = c;
    const angles = [
      `Sirf ${t.name} mat becho — ek "combo" banao. ${t.name} + add-on item ka combo average bill ${ri(r,18,45)}% badha deta hai, aur cost almost same rehta hai.`,
      `Do tarah ke customer hote hain: daily regular aur occasion wala. ${t.name} me dono ke liye alag offer rakho — regular ke liye loyalty, occasion ke liye premium pack.`,
      `${t.name} me "sub-brand" banao: ek budget line aur ek premium line. Same kitchen/setup, do price points, do tarah ka crowd.`,
      `Sabse underrated model: B2B supply. ${t.name} ka bulk order (offices, hostels, caterers) roz ka fixed revenue deta hai — footfall pe depend nahi karna padta.`,
      `${t.name} ka "subscription / monthly package" model try karo. Ek baar customer jud gaya toh churn sirf quality kharab hone pe hota hai.`
    ];
    const a = pick(r, angles);
    const margin = ri(r, t.margin[0], t.margin[1]);
    return {
      tag: 'Business Idea',
      title: pick(r, [`${t.name}: 0 se shuru karne ka sabse practical tareeka`, `${t.name} ka business model jo actually chalta hai`, `${t.name} me differentiate kaise karein?`, `${t.name}: chhote investment me bada margin kaise?`]),
      blocks: [
        { t: 'p', v: pick(r, OPENERS[t.type]).replace(/\{N\}/g, t.name) },
        { t: 'hl', v: a },
        { t: 'kv', v: [
          ['Average margin', margin + '%'],
          ['Daily target (' + t.unitName + ')', String(Math.round(t.daily[0] * 0.7)) + ' – ' + Math.round(t.daily[1] * 0.6)],
          ['Break-even time', ri(r,4,11) + ' mahine'],
          ['Sabse pehla kadam', pick(r, ['10 din ka market survey','Pehle 20 customer se baat','Chhote setup se pilot','Competitor rate mapping'])]
        ]},
        { t: 'li', v: picks(r, [
          `Pehle 30 din sirf data collect karo — kitne log aaye, kitne ne kharida, kitne wapas aaye`,
          `Ek signature item rakho jo sirf aapke paas ho — wahi aapki pehchaan banega`,
          `Timing fix rakho. ${t.name} me customer habit se aata hai, isliye roz same time khulna zaroori hai`,
          `Packaging pe naam + number likho — free marketing hai`,
          `Pehle mahine profit mat dekho, repeat rate dekho`
        ], 3) },
        { t: 'p', v: region ? region.flavour[0] + '.' : 'Apne ilake ka crowd samjho — wahi aapka asli market research hai.' },
        { t: 'quote', v: pick(r, CTAS) }
      ]
    };
  };

  /* ---- 2. Investment breakdown ---- */
  P.investment = function (c) {
    const { t, r } = c;
    const setup = round500(ri(r, t.setup[0], t.setup[1]));
    const eq = round500(setup * rf(r, .38, .48));
    const int = round500(setup * rf(r, .12, .2));
    const lic = round500(setup * rf(r, .03, .07));
    const dep = round500(t.rent[0] * ri(r, 3, 6));
    const work = round500(setup * rf(r, .18, .26));
    const misc = setup - eq - int - lic - dep - work;
    const rows = [
      ['Equipment / machinery', inr(eq)],
      ['Interior + fittings', inr(int)],
      ['Licence + paperwork', inr(lic)],
      ['Security deposit (rent)', inr(dep)],
      ['Working capital (2-3 mahine)', inr(work)],
      ['Misc + buffer', inr(Math.max(misc, 5000))],
      ['Total setup', inr(setup)]
    ];
    return {
      tag: 'Investment',
      title: pick(r, [`${t.name}: kitna paisa lagega? (poora breakdown)`, `${t.name} shuru karne ka real cost structure`, `${t.name}: ${inr(setup)} me kya-kya milega?`]),
      blocks: [
        { t: 'p', v: `${t.name} shuru karne ke liye log seedha equipment ka sochte hain. Asli kharcha equipment nahi — working capital aur deposit hai, jo sabse zyada log bhoolte hain.` },
        { t: 'math', v: rows, sum: rows.length - 1 },
        { t: 'hl', v: `Rule: setup cost ka kam se kam ${ri(r,20,30)}% working capital ke liye alag rakho. Bina iske 3 mahine me cash khatam ho jata hai.` },
        { t: 'li', v: picks(r, [
          `Sabse pehle 2nd-hand equipment dekho — ${t.name} me 40-60% savings ho jati hai`,
          `Deposit kam karwane ke liye 6 mahine ka advance rent offer karo (agar cash hai)`,
          `Interior pe over-invest mat karo. Customer quality dekhta hai, sofa nahi`,
          `Licence ka kaam khud karo — agent ₹${ri(r,3000,12000)} leta hai jo bach sakta hai`,
          `Ek contingency fund alag rakho — kam se kam 1 mahine ka fixed cost`
        ], 3) },
        { t: 'p', v: `Loan lena ho toh MUDRA / PMEGP scheme dekho — ${t.name} jaise chhote business ke liye collateral-free loan milta hai (₹${ri(r,50000,500000).toLocaleString('en-IN')} tak).` },
        { t: 'quote', v: pick(r, CTAS) }
      ]
    };
  };

  /* ---- 3. Pricing & margin math ---- */
  P.pricing = function (c) {
    const { t, r } = c;
    const cost = round5(ri(r, t.unitCost[0], t.unitCost[1]));
    const price = round5(Math.max(t.unitPrice[0], Math.round(cost * rf(r, 1.8, 2.9))));
    const profit = price - cost;
    const pct = Math.round((profit / price) * 100);
    const daily = Math.round((t.daily[0] + t.daily[1]) / 2);
    const dailyProfit = profit * daily;
    const rent = round500(ri(r, t.rent[0], t.rent[1]));
    const fixed = round500(rent + ri(r, t.staff[0], t.staff[1]) * ri(r, 8000, 16000) + ri(r, 3000, 12000));
    const beUnits = Math.ceil(fixed / Math.max(profit, 1));
    return {
      tag: 'Pricing & Margin',
      title: pick(r, [`${t.name}: per-unit profit ka pura hisaab`, `${t.name} ka rate kaise decide karein? (math ke saath)`, `${t.name}: kitna bechna hoga tab jakar profit shuru?`]),
      blocks: [
        { t: 'p', v: `Rate guess se nahi set karte. Pehle per-unit cost nikalo, phir uspe overhead load karo, phir market check karo. Yahi sequence hai.` },
        { t: 'kv', v: [
          ['Per ' + t.unitName + ' cost', inr(cost)],
          ['Selling price', inr(price)],
          ['Gross profit / ' + t.unitName, inr(profit) + '  (' + pct + '%)'],
          ['Daily volume (realistic)', daily + ' ' + t.unitName],
          ['Daily gross profit', inr(dailyProfit)],
          ['Monthly fixed cost', '~' + inr(fixed)],
          ['Break-even', beUnits + ' ' + t.unitName + '/din']
        ]},
        { t: 'hl', v: `Break-even ${beUnits} ${t.unitName} per din hai. Matlab roz ${beUnits} se upar bikna zaroori hai — uske neeche loss hai, uske upar profit.` },
        { t: 'li', v: picks(r, [
          `Cost me sab kuch daalo — gas, packaging, waste, apni salary. Sirf raw material gin-ne wale 90% log galat rate set karte hain`,
          `Rate competitor se ${ri(r,5,15)}% upar rakho lekin quality visibly better karo`,
          `Waste ko cost me ${ri(r,3,8)}% zaroor add karo — ${t.name} me waste hota hi hai`,
          `Har 3 mahine me rate review karo, saal me ek saath badhane se customer bhaagta hai`,
          `Ek premium variant rakho — usse average bill badhta hai, bina volume badhaye`
        ], 3) },
        { t: 'quote', v: pick(r, CTAS) }
      ]
    };
  };

  /* ---- 4. Daily operations ---- */
  P.ops = function (c) {
    const { t, r } = c;
    const steps = shuffle(r, [
      `Opening: shutter kholte hi ${pick(r, t.equip)} check karo, sab kuch kaam kar raha hai ya nahi`,
      `Pre-production: ${t.peak[0]} se pehle saara prep ready ho — rush me prep nahi hota`,
      `Quality check: pehla batch khud taste/test karo. Pehla batch kharab toh poora din kharab`,
      `Peak hour: sirf production pe focus — billing aur safai peak ke baad karo`,
      `Mid-day reset: stock count, counter wipe, aur agle batch ka material nikalo`,
      `Closing: cash count, stock entry, waste record, aur kal ka prep list`,
      `Daily closing register: aaj ka sales, kharcha, waste, aur kal ka target — 10 minute ka kaam`,
      `Weekly: deep cleaning + equipment servicing, aur staff review`
    ]).slice(0, 6);
    return {
      tag: 'Operations',
      title: pick(r, [`${t.name}: ek perfect din ka schedule`, `${t.name} ka daily routine jo profit banata hai`, `${t.name} me roz ke ${ri(r,8,12)} ghante kaise manage karein?`]),
      blocks: [
        { t: 'p', v: `${t.name} me asli management "bade decisions" nahi, daily routine hai. Jo roz wahi discipline follow karta hai, wahi 2 saal baad bhi khada rehta hai.` },
        { t: 'steps', v: steps.map((s, i) => (i + 1) + '. ' + s) },
        { t: 'hl', v: `Peak hour ${t.peak[0]} hai. Us ${ri(r,2,4)} ghante me 100% focus production pe — koi naya kaam, koi meeting, koi supplier call nahi.` },
        { t: 'kv', v: [
          ['Opening se pehle', ri(r,60,120) + ' min prep'],
          ['Peak hours', t.peak[0]],
          ['Closing routine', ri(r,30,60) + ' min'],
          ['Weekly deep clean', pick(r, ['Monday','Tuesday','Wednesday'])]
        ]},
        { t: 'quote', v: pick(r, CTAS) }
      ]
    };
  };

  /* ---- 5. Staffing ---- */
  P.staff = function (c) {
    const { t, r } = c;
    const n = ri(r, t.staff[0], t.staff[1]);
    const sal = ri(r, 8000, 18000);
    return {
      tag: 'Staff & Team',
      title: pick(r, [`${t.name}: kitne log chahiye aur kitna kharcha?`, `${t.name} me staff ko tikaye kaise rakhein?`, `${t.name}: hiring, training aur retention ka pura plan`]),
      blocks: [
        { t: 'p', v: `${t.name} me staff sirf labour nahi, aapka brand ambassador hai. Customer aapko nahi, unhe dekhta hai. Isliye selection se zyada retention important hai.` },
        { t: 'kv', v: [
          ['Starting team size', n + ' log'],
          ['Roles', t.staffRoles.slice(0, n).join(', ')],
          ['Average salary', inr(sal) + ' /month'],
          ['Monthly staff cost', '~' + inr(sal * n)],
          ['Training period', ri(r,7,21) + ' din']
        ]},
        { t: 'li', v: picks(r, [
          `Salary ke saath ek chhota incentive rakho — jaise monthly target pe ₹${round100(ri(r,1000,4000))} bonus. Isse output 20-30% badhta hai`,
          `Har role ka 1-page SOP likho. Naya banda aate hi wahi padhe — aapko baar baar sikhana nahi padega`,
          `Cross-train karo — kam se kam 2 log har kaam jaante ho. Warna ek chhutti se business ruk jata hai`,
          `Staff ke saath payment date kabhi mat todo. Ek baar late, aur trust khatam`,
          `Ek "star of the month" chhota sa recognition rakho — paisa kam, asar zyada`,
          `Hamesha ek backup banda pipeline me rakho, emergency me 2 din me kaam shuru ho jaye`
        ], 4) },
        { t: 'hl', v: `Sabse badi galti: sirf salary pe hiring karna. Attitude aur reliability dekho — skill 15 din me sikh jati hai, attitude saal me nahi badalta.` },
        { t: 'quote', v: pick(r, CTAS) }
      ]
    };
  };

  /* ---- 6. Cleaning & hygiene ---- */
  P.hygiene = function (c) {
    const { t, r } = c;
    const items = t.hygiene.slice();
    const daily = picks(r, items, Math.min(4, items.length));
    return {
      tag: 'Cleaning & Hygiene',
      title: pick(r, [`${t.name}: hygiene checklist jo review bachata hai`, `${t.name} me safai ka system kaise banayein?`, `Chhoti si gande-pan ki wajah se ${t.name} ka business doob jata hai`]),
      blocks: [
        { t: 'p', v: `Customer ek baar gandagi dekh leta hai aur wapas nahi aata — aur 10 logon ko bata deta hai. ${t.name} me safai "extra kaam" nahi, core product hai.` },
        { t: 'li', v: daily.map(x => x) },
        { t: 'steps', v: [
          '1. Ek A4 page ka daily cleaning checklist chipka do (counter ke peeche)',
          '2. Har task ke aage staff ka initial + time likha jaye',
          '3. Weekly deep clean ka fixed din rakho — wo din sales kam ho toh chalega',
          '4. Monthly pest control + equipment servicing — budget me pehle se rakho',
          '5. Har mahine ek baar khud "customer ki nazar" se poora space dekho'
        ]},
        { t: 'hl', v: `Psychology: log washroom/counter ki safai dekh kar decide karte hain ki kitchen/kaam kitna clean hoga. Isliye jo dikhta hai uspe 2x dhyan do.` },
        { t: 'kv', v: [
          ['Daily cleaning time', ri(r,30,75) + ' min'],
          ['Deep clean', 'Hafte me 1 baar'],
          ['Pest control', 'Mahine me 1 baar (~' + inr(ri(r,800,2500)) + ')'],
          ['Staff hygiene kit', 'Apron + gloves + cap + handwash']
        ]},
        { t: 'quote', v: pick(r, CTAS) }
      ]
    };
  };

  /* ---- 7. Legal / licences / ownership ---- */
  P.legal = function (c) {
    const { t, r } = c;
    return {
      tag: 'Ownership & Legal',
      title: pick(r, [`${t.name}: kaun se licence chahiye? (poori list)`, `${t.name} ka business legal tareeke se kaise register karein?`, `${t.name}: ownership structure aur paperwork guide`]),
      blocks: [
        { t: 'p', v: `Bahut log ${t.name} bina registration ke chala lete hain — chalta hai, jab tak koi complaint ya inspection nahi aata. Ek notice ka fine poore saal ka profit kha jaata hai.` },
        { t: 'li', v: t.licenses.map((l, i) => l) },
        { t: 'kv', v: [
          ['Ownership type', pick(r, ['Proprietorship (sabse simple)', 'Partnership (2+ log)', 'LLP (liability limited)'])],
          ['Total paperwork cost', inr(ri(r, 2500, 12000))],
          ['Time lagta hai', ri(r, 7, 30) + ' din'],
          ['Bank account', 'Current account (aadhaar + PAN + address proof)']
        ]},
        { t: 'hl', v: `Sabse pehle Udyam Registration karo — free hai, 10 minute online ho jata hai, aur MSME benefits (loan, tender, late payment protection) milte hain.` },
        { t: 'li', v: picks(r, [
          `Rent agreement hamesha 11 mahine ka + registered karo — deposit dispute me yahi kaam aata hai`,
          `Trade licence ka renewal date calendar me daalo — late fee + penalty lagti hai`,
          `Partnership me likhit agreement zaroori hai — dosti me business nahi chalta`,
          `Fire NOC aur first-aid box rakho — inspection me sabse pehle yahi poochte hain`,
          `Staff ka police verification karwao — chhoti si galti ka bada nuksaan hota hai`
        ], 3) },
        { t: 'quote', v: pick(r, CTAS) }
      ]
    };
  };

  /* ---- 8. Marketing & footfall ---- */
  P.marketing = function (c) {
    const { t, r, region } = c;
    return {
      tag: 'Marketing',
      title: pick(r, [`${t.name}: bina paisa lagaye customer kaise laayein?`, `${t.name} ki marketing jo actually kaam karti hai`, `${t.name}: pehle 100 customer kaise laayein?`]),
      blocks: [
        { t: 'p', v: `${t.name} me sabse badi marketing aapka product khud hai. Ads sirf awareness dete hain — repeat customer sirf experience se banta hai.` },
        { t: 'li', v: picks(r, [
          `Google Business Profile banao — FREE hai, aur "${t.name.toLowerCase()} near me" search pe sabse pehle dikhta hai. Har customer se review mango`,
          `WhatsApp Business — catalogue + broadcast list. Ek message se ${ri(r,50,300)} regular customers tak pahunch`,
          `Instagram pe daily 1 reel/story — ${t.name} visual hai, isliye content khud banta hai`,
          `Opening week me "first ${ri(r,50,200)} customers ko ${ri(r,10,25)}% off" — rush create karo`,
          `Nearby offices/hostels me leaflet + card distribute karo — B2B order yahin se aate hain`,
          `Ek referral scheme: "dost ko laao, dono ko ${ri(r,10,20)}% off" — sabse sasti marketing`,
          `Google Maps pe pin + 20 reviews = 6 mahine tak free customer`
        ], 4) },
        { t: 'kv', v: [
          ['Starting marketing budget', inr(ri(r, 1000, 6000)) + '/mahine'],
          ['Sabse high ROI', pick(r, ['Google Business Profile','WhatsApp broadcast','Referral scheme','Instagram reels'])],
          ['Pehla target', ri(r,100,500) + ' customers / 3 mahine'],
          ['Review target', ri(r,20,60) + ' Google reviews in 90 din']
        ]},
        { t: 'hl', v: region ? region.flavour[ri(r,0,region.flavour.length-1)] + '.' : `Local SEO sabse zyada underrated hai — ${t.name.toLowerCase()} jaise business ke liye 80% search "near me" hote hain.` },
        { t: 'quote', v: pick(r, CTAS) }
      ]
    };
  };

  /* ---- 9. Quality control ---- */
  P.quality = function (c) {
    const { t, r } = c;
    return {
      tag: 'Quality Control',
      title: pick(r, [`${t.name}: consistency kaise maintain karein?`, `${t.name} ki quality fix karna — 5 rules`, `Ek din accha, ek din kharab — ${t.name} ka sabse bada problem`]),
      blocks: [
        { t: 'p', v: `Customer ko ek baar kharab experience mila toh wo wapas nahi aata. ${t.name} me quality "achha banaya" nahi hai — quality matlab roz EXACTLY wahi.` },
        { t: 'steps', v: [
          '1. Standard recipe/spec card likho — exact quantity, time, temperature',
          '2. Har batch ka pehla sample khud check karo',
          '3. Raw material ka fixed supplier rakho — brand badalne se taste badalta hai',
          '4. Ek "quality register" rakho — daily check-in, staff ke initial ke saath',
          '5. Customer feedback ko ignore mat karo — 3 same complaints = system change karo'
        ]},
        { t: 'li', v: picks(r, [
          `Measuring tools use karo — "andaza" se consistency nahi aati. Scale + measuring cup ₹${ri(r,300,1500)} ka hai`,
          `Har staff ko same training do — warna 3 log 3 tarah ka product banayenge`,
          `Raw material ko FIFO (first-in-first-out) me rakho — purana pehle use ho`,
          `Storage temperature/humidity note karo — ${t.name} me yahi sabse common quality killer hai`,
          `Har mahine blind taste test karo — apna product competitor ke saath compare karo`
        ], 3) },
        { t: 'hl', v: `Rule of 3: agar 3 alag customers ne same shikayat ki, toh galti customer ki nahi, aapke system ki hai.` },
        { t: 'quote', v: pick(r, CTAS) }
      ]
    };
  };

  /* ---- 10. Location & rent ---- */
  P.location = function (c) {
    const { t, r, region } = c;
    const rent = round500(ri(r, t.rent[0], t.rent[1]));
    return {
      tag: 'Location & Rent',
      title: pick(r, [`${t.name} ke liye sahi jagah kaise chunein?`, `${t.name}: rent kitna dena chahiye? (formula)`, `${t.name} ki location select karne ke ${ri(r,5,7)} rules`]),
      blocks: [
        { t: 'p', v: `Location ${t.name} me 50% success decide karta hai — par "sabse badi market" wali jagah sabse best nahi hoti. Rent aur footfall ka balance chahiye.` },
        { t: 'kv', v: [
          ['Expected rent', inr(rent) + ' /mahine'],
          ['Security deposit', inr(rent * ri(r,3,6))],
          ['Safe rent rule', 'Expected monthly sales ka ' + ri(r,6,12) + '% se zyada nahi'],
          ['Ideal area', ri(r,150,900) + ' sq.ft (starting)'],
          ['Agreement tenure', ri(r,3,5) + ' saal + lock-in']
        ]},
        { t: 'li', v: picks(r, [
          `Subah, dopahar aur shaam — teeno time pe footfall count karo (15-15 minute). Ek time ka data jhooth bolta hai`,
          `Same street ke 2-3 existing ${t.name.toLowerCase()} businesses se baat karo — asli data wahi denge`,
          `Parking/2-wheeler standing space check karo — na hone se 30% walk-in khatam`,
          `Visibility: kya road se board dikhta hai? Corner plot > mid-street`,
          `Water supply + power backup + drainage pehle check karo — baad me lakhon lagte hain`,
          `Competitor ke paas hona bura nahi hai — "cluster" me footfall khud aata hai`
        ], 4) },
        { t: 'hl', v: `Formula: agar expected monthly sales ₹X hai, toh rent ₹X ka ${ri(r,6,12)}% se upar nahi hona chahiye. Isse upar gaya toh profit sirf landlord ka banega.` },
        { t: 'p', v: region ? region.note : 'Apne ilake ke 2-3 alag locations ka comparison sheet banao — rent, footfall, competitor, parking. Ek din ka kaam, saal bhar ka fayda.' },
        { t: 'quote', v: pick(r, CTAS) }
      ]
    };
  };

  /* ---- 11. Seasonality ---- */
  P.season = function (c) {
    const { t, r, region } = c;
    const fest = region ? region.festivals.slice(0, 2) : picks(r, t.seasonal, 2);
    return {
      tag: 'Season & Festival',
      title: pick(r, [`${t.name} me festival ka business 3x kaise karein?`, `${t.name}: seasonal demand ka pura plan`, `${t.name} ka peak season — pehle se taiyari`]),
      blocks: [
        { t: 'p', v: `${t.name} me saal ka ${ri(r,35,55)}% profit sirf ${ri(r,3,5)} peak mahino me banta hai. Jo pehle se taiyar rehta hai, wahi poora faida uthata hai.` },
        { t: 'kv', v: [
          ['Peak period', fest.join(', ')],
          ['Expected jump', ri(r,2,5) + 'x normal volume'],
          ['Prep lead time', ri(r,15,40) + ' din pehle'],
          ['Off-season strategy', pick(r, ['Naya item launch','B2B/corporate tie-up','Discount + combo','Delivery focus'])]
        ]},
        { t: 'steps', v: [
          `1. ${fest[0]} se ${ri(r,30,45)} din pehle — staff extra hire karo (temporary)`,
          `2. Raw material ka advance booking karo — peak me rate ${ri(r,15,40)}% badh jata hai`,
          `3. Advance order book karo — advance me 20% paisa le lo, cash flow fix`,
          `4. Peak me extra counter/temporary stall lagao — capacity badhao`,
          `5. Peak ke turant baad stock clearance sale — dead stock mat rakho`
        ]},
        { t: 'hl', v: `Sabse badi galti: peak season me raw material khatam ho jana. ${ri(r,20,40)}% extra stock rakho — bechna aasan hai, khali haath rehna mehnga.` },
        { t: 'p', v: region ? region.flavour[ri(r, 0, region.flavour.length - 1)] + '.' : 'Apne ilake ka local festival calendar banao — national festivals se zyada local tyohaar bikta hai.' },
        { t: 'quote', v: pick(r, CTAS) }
      ]
    };
  };

  /* ---- 12. Common mistakes ---- */
  P.mistakes = function (c) {
    const { t, r } = c;
    return {
      tag: 'Common Mistakes',
      title: pick(r, [`${t.name}: 7 galtiyan jo business band karwa deti hain`, `${t.name} me ye mat karna (real failures)`, `${t.name}: naye owners ki sabse badi galtiyan`]),
      blocks: [
        { t: 'p', v: `${t.name} me 10 me se 7 business pehle saal me band ho jaate hain. Wajah capital nahi — ye chhoti-chhoti galtiyan hain.` },
        { t: 'li', v: shuffle(r, [
          `Hisaab-kitaab na rakhna — "sab yaad hai" kehne wale sabse pehle doobte hain. Roz likho`,
          `Rate competitor dekh kar set karna — unka cost structure aapse alag ho sakta hai`,
          `Pehle mahine ka profit dekh kar scale karna — pehla mahina honeymoon hota hai`,
          `Udhaar bina limit ke dena — 6 mahine me cash flow band`,
          `Staff pe 100% depend, khud kaam na seekhna — staff gaya, business gaya`,
          `Quality pe compromise jab crowd zyada ho — exactly tabhi customer judge karta hai`,
          `Ek hi supplier pe depend rehna — rate badhaya toh margin khatam`,
          `Marketing pe zero kharcha — "achha product hai, log khud aayenge" — nahi aate`,
          `Fixed cost badhate rehna (naya AC, naya furniture) jab profit aana shuru ho`,
          `Complaint sun kar defensive hona — complain karta hai matlab customer abhi bhi aapka hai`
        ]).slice(0, 6) },
        { t: 'hl', v: `Ek kaam aaj hi karo: ek register lo aur roz 3 number likho — sales, kharcha, waste. 30 din baad aapko apni asli galti khud dikh jayegi.` },
        { t: 'quote', v: pick(r, CTAS) }
      ]
    };
  };

  /* ---- 13. Scaling ---- */
  P.scale = function (c) {
    const { t, r } = c;
    return {
      tag: 'Scaling Up',
      title: pick(r, [`${t.name}: ek se do outlet kab aur kaise?`, `${t.name} ko franchise me kaise badlein?`, `${t.name}: growth ka next level kya hai?`]),
      blocks: [
        { t: 'p', v: `${t.name} me scale karne ki jaldi sabse badi galti hai. Pehla outlet system pe chale, tabhi doosra socho. Warna dono doobenge.` },
        { t: 'steps', v: [
          `1. Pehle outlet ko "owner-independent" banao — aap 1 hafta gayab raho, sab normal chale`,
          `2. Har kaam ka written SOP banao — recipe, opening, closing, complaint handling`,
          `3. Ek reliable manager train karo — wahi doosre outlet ka in-charge banega`,
          `4. Doosra outlet ${ri(r,3,8)} km door rakho — apna hi customer base na kate`,
          `5. Central kitchen/supply socho — 3+ outlet pe cost ${ri(r,15,30)}% girta hai`
        ]},
        { t: 'kv', v: [
          ['Ready to scale when', ri(r,6,12) + ' mahine consistent profit'],
          ['Second outlet cost', inr(round500(ri(r, t.setup[0], t.setup[1]) * rf(r, .7, .95)))],
          ['Franchise fee (agar do)', inr(ri(r,50000,300000)) + ' + royalty'],
          ['Central kitchen benefit', ri(r,15,30) + '% cost saving at 3+ outlets']
        ]},
        { t: 'li', v: picks(r, [
          `Franchise dene se pehle brand + recipe legally protect karo (trademark ~₹${ri(r,4500,9000)})`,
          `Doosre outlet ko "same brand, same quality" rakho — ek kharab outlet poora brand kharab karta hai`,
          `Pehle delivery/cloud model se expand karo — rent kam, test aasan`,
          `Har naya outlet pe 6 mahine ka personal attention zaroori hai`
        ], 3) },
        { t: 'quote', v: pick(r, CTAS) }
      ]
    };
  };

  /* ---- 14. Digital / online ---- */
  P.digital = function (c) {
    const { t, r } = c;
    const isFood = t.type === 'food' || t.type === 'place';
    return {
      tag: 'Digital & Payments',
      title: pick(r, [`${t.name} ko online kaise le jaayein?`, `${t.name}: delivery apps, UPI aur online orders`, `${t.name} ke liye digital setup (complete)`]),
      blocks: [
        { t: 'p', v: `Aaj ${ri(r,55,75)}% customer pehle phone pe check karta hai — rating, price, timing. Jo online nahi hai, wo exist hi nahi karta.` },
        { t: 'li', v: shuffle(r, isFood ? [
          `Zomato/Swiggy — commission ${ri(r,20,30)}% hai, par naya customer laata hai. Pehle 3 mahine discovery ke liye use karo, phir direct order push karo`,
          `WhatsApp Business — apna direct order channel. Zero commission, aur customer data aapka rehta hai`,
          `UPI QR har counter pe — cash handling ka jhanjhat khatam, hisaab automatic`,
          `Google Business Profile — timing, photos, menu. Free hai aur sabse zyada convert karta hai`,
          `Instagram page + daily story — ${t.name.toLowerCase()} visual hai, content free me banta hai`,
          `Ek simple billing app (Vyapar/KhataBook) — udhaar, stock, GST sab ek jagah`
        ] : [
          `Google Business Profile + WhatsApp Business — ye do cheezein 80% kaam kar deti hain`,
          `UPI + card dono accept karo — cash-only se ${ri(r,15,30)}% customer chala jata hai`,
          `Online booking/appointment system — waiting time badhne se customer bhaagta hai`,
          `Instagram + Google reviews — service business me review hi asli sales pitch hai`,
          `Ek simple CRM (Excel bhi chalega) — customer history = repeat sale`,
          `Website ki zaroorat shuru me nahi — Google + Instagram + WhatsApp kaafi hai`
        ]).slice(0, 5) },
        { t: 'kv', v: [
          ['Setup cost', inr(ri(r, 500, 5000))],
          ['Time lagta hai', ri(r,1,3) + ' din'],
          ['Expected boost', ri(r,15,40) + '% naya customer'],
          ['Sabse pehla step', 'Google Business Profile']
        ]},
        { t: 'hl', v: `Golden rule: delivery apps pe depend mat raho. Apna direct channel (WhatsApp) strong karo — commission bachega aur customer data aapka rahega.` },
        { t: 'quote', v: pick(r, CTAS) }
      ]
    };
  };

  /* ---- 15. Finance & cash flow ---- */
  P.finance = function (c) {
    const { t, r } = c;
    const rev = round500(ri(r, t.daily[0], t.daily[1]) * ((t.unitPrice[0] + t.unitPrice[1]) / 2) * 30);
    const foodCost = Math.round(rev * rf(r, .35, .48));
    const rent = round500(ri(r, t.rent[0], t.rent[1]));
    const staff = round500(ri(r, t.staff[0], t.staff[1]) * ri(r, 9000, 16000));
    const util = round500(ri(r, 3000, 15000));
    const misc = round500(rev * rf(r, .03, .07));
    const net = rev - foodCost - rent - staff - util - misc;
    return {
      tag: 'Finance & Cash Flow',
      title: pick(r, [`${t.name}: mahine ka pura hisaab (P&L)`, `${t.name} me profit kahan jaata hai?`, `${t.name}: cash flow manage karne ka tareeka`]),
      blocks: [
        { t: 'p', v: `Bahut se ${t.name.toLowerCase()} owners ko lagta hai business chal raha hai — kyunki roz paisa aata hai. Par "paisa aana" aur "profit hona" do alag cheezein hain.` },
        { t: 'math', v: [
          ['Monthly revenue', inr(rev)],
          ['Raw material / COGS', '- ' + inr(foodCost) + '  (' + Math.round(foodCost / rev * 100) + '%)'],
          ['Rent', '- ' + inr(rent)],
          ['Staff salary', '- ' + inr(staff)],
          ['Bijli/paani/gas', '- ' + inr(util)],
          ['Misc + maintenance', '- ' + inr(misc)],
          ['Net profit', inr(net) + '  (' + Math.round(net / rev * 100) + '%)']
        ], sum: 6 },
        { t: 'hl', v: net > 0 ? `Is model pe net margin ${Math.round(net/rev*100)}% hai. Matlab har ₹100 ki sale pe ₹${Math.round(net/rev*100)} bachta hai — aur yahi realistic hai.` : `Dhyan do: is structure pe margin patla hai. Ya toh volume badhao ya fixed cost kam karo.` },
        { t: 'li', v: picks(r, [
          `Business aur personal paisa alag rakho — ek alag bank account. Mix hone pe kabhi pata nahi chalega ki profit hai ya nahi`,
          `Apni salary fix karo — profit me se nahi, kharche me se. Warna aap free me kaam kar rahe ho`,
          `Har mahine 10% profit emergency fund me daalo — 6 mahine ka fixed cost target rakho`,
          `Udhaar ka register + limit. 30 din se purana udhaar = loss`,
          `Depreciation bhi kharcha hai — equipment ${ri(r,3,7)} saal me badalna padega, uska paisa aaj se bachao`,
          `GST threshold cross hone se pehle CA se baat karo — baad me penalty lagti hai`
        ], 4) },
        { t: 'quote', v: pick(r, CTAS) }
      ]
    };
  };

  /* ---- 16. Competition ---- */
  P.competition = function (c) {
    const { t, r } = c;
    return {
      tag: 'Competition',
      title: pick(r, [`${t.name}: competitor se aage kaise niklein?`, `${t.name} market me bheed hai — kya karein?`, `${t.name}: competition ka smart analysis`]),
      blocks: [
        { t: 'p', v: `${t.name} me competition hamesha rahega — aur competition accha hai, matlab market hai. Problem competition nahi, "same cheez same rate pe bechna" hai.` },
        { t: 'steps', v: [
          `1. Apne 3 km radius ke saare ${t.name.toLowerCase()} businesses ki list banao (Google Maps se 20 minute me ho jayega)`,
          `2. Har ek ke paas customer bankar jao — rate, quality, timing, behaviour, bheed note karo`,
          `3. Ek comparison sheet banao: price / quality / speed / cleanliness / service`,
          `4. Wahan se ek "gap" dhundo jo koi fill nahi kar raha`,
          `5. Usi gap ko apni USP banao — sab kuch me accha hone ki koshish mat karo`
        ]},
        { t: 'li', v: picks(r, [
          `Rate war mat lado — usme sabse bada player jeetega, aap nahi`,
          `Ek cheez me best bano: ya quality, ya speed, ya variety, ya service. Sab me average = koi nahi aayega`,
          `Competitor ki weakness aapki opportunity hai — agar wo evening band karte hain, aap evening pe focus karo`,
          `Competitor ko copy mat karo, usse better karo — aur clearly batao ki aap kya alag karte ho`,
          `Naye customer se seedha pucho: "pehle kahan se lete the aur kyun badla?" — yahi asli market research hai`
        ], 3) },
        { t: 'hl', v: `Real truth: customer "sabse sasta" nahi dhundta — "sabse reliable" dhundta hai. Consistency hi competition ka jawab hai.` },
        { t: 'quote', v: pick(r, CTAS) }
      ]
    };
  };

  /* ---- 17. Waste & inventory ---- */
  P.waste = function (c) {
    const { t, r } = c;
    return {
      tag: 'Waste & Inventory',
      title: pick(r, [`${t.name}: waste kam karo, profit badhao`, `${t.name} me inventory manage karne ka tareeka`, `${t.name}: jo bacha hua maal karein kya?`]),
      blocks: [
        { t: 'p', v: `${t.name} me waste directly profit kha jaata hai. ${ri(r,5,12)}% waste normal lagta hai, par control kiya jaye toh wahi ${ri(r,5,12)}% seedha net profit me jud jaata hai.` },
        { t: 'li', v: picks(r, [
          `Daily production plan banao — pichhle 7 din ke average se. "Andaze" se banane pe waste hota hai`,
          `FIFO rule: purana stock pehle use ho. Shelf pe date likho`,
          `Bacha hua item discount me shaam ko bech do — 50% pe bechna, phenkne se behtar hai`,
          `Waste ko roj register me likho — item + reason. 2 hafte me pattern dikh jayega`,
          `Raw material bulk me mat khareedo agar storage weak hai — sasta padta hai par kharab ho jaata hai`,
          `Portion control karo — ek extra scoop/spoon roz ka ₹${ri(r,100,600)} saal me lakh ban jaata hai`,
          `Near-expiry stock ko "today's special" bana do — waste zero, sales extra`
        ], 4) },
        { t: 'kv', v: [
          ['Acceptable waste', ri(r,3,6) + '%'],
          ['Danger zone', ri(r,10,15) + '% se upar'],
          ['Stock count frequency', 'Hafte me 1 baar (full)'],
          ['Potential monthly saving', inr(round500(ri(r, 2000, 15000)))]
        ]},
        { t: 'hl', v: `Sabse asaan trick: shaam ko last ${ri(r,60,120)} minute me "happy hour" discount rakho. Waste zero + extra revenue + naye customers ka trial.` },
        { t: 'quote', v: pick(r, CTAS) }
      ]
    };
  };

  /* ---- 18. Customer experience ---- */
  P.customer = function (c) {
    const { t, r } = c;
    return {
      tag: 'Customer Experience',
      title: pick(r, [`${t.name}: customer ko regular kaise banayein?`, `${t.name} me chhoti cheezein jo customer wapas laati hain`, `${t.name}: loyalty banane ka practical tareeka`]),
      blocks: [
        { t: 'p', v: `Naya customer laane ka kharcha purane ko wapas laane se ${ri(r,4,7)} guna zyada hai. ${t.name} me asli paisa repeat customer me hai — aur repeat sirf behaviour se banta hai.` },
        { t: 'li', v: picks(r, [
          `Customer ka naam yaad rakho — 10 baar aane wale ko naam se bulao. Ye free hai aur sabse powerful hai`,
          `Complaint pe pehle maafi, phir solution. Bahas karne wala customer hamesha chala jata hai`,
          `Waiting time me kuch do — paani, chhoti si baat, ya sirf "2 minute me aa gaya" bolna`,
          `Loyalty card: ${ri(r,8,12)} pe 1 free. Purana idea hai par ${t.name.toLowerCase()} me bahut chalta hai`,
          `Regular customer ki pasand yaad rakho — "aaj bhi wahi?" ye ek line retention badha deti hai`,
          `Chhoti si extra cheez free do (jaise extra chutney/servicing tip) — cost ₹${ri(r,2,10)}, impact 10x`,
          `Birthday/festival pe WhatsApp message bhejo — bulk list se nahi, personally`
        ], 4) },
        { t: 'hl', v: `Rule: ek khush customer ${ri(r,3,8)} naye laata hai. Ek naraz customer ${ri(r,10,20)} ko bata deta hai. Dono free hain — choice aapki hai.` },
        { t: 'kv', v: [
          ['Repeat customer target', ri(r,40,65) + '% of total'],
          ['Complaint response time', 'Same day'],
          ['Review request', 'Happy customer se turant pucho'],
          ['Sabse sasta retention', 'Naam yaad rakhna']
        ]},
        { t: 'quote', v: pick(r, CTAS) }
      ]
    };
  };

  /* ---- 19. Sourcing ---- */
  P.sourcing = function (c) {
    const { t, r } = c;
    return {
      tag: 'Sourcing & Suppliers',
      title: pick(r, [`${t.name}: raw material kahan se aur kaise lein?`, `${t.name} me supplier management ke ${ri(r,4,6)} rules`, `${t.name}: material cost ${ri(r,10,25)}% kaise kam karein?`]),
      blocks: [
        { t: 'p', v: `${t.name} me raw material cost total cost ka ${ri(r,35,50)}% hota hai. Isliye 10% ki bhi bachat seedha net profit me jaati hai. Par sasta hi sab kuch nahi hota.` },
        { t: 'li', v: picks(r, [
          `Kam se kam 3 supplier ka rate list rakho — ek pe depend rehna sabse badi galti hai`,
          `Mandi/wholesale market khud jao — distributor se ${ri(r,10,25)}% sasta padta hai`,
          `Payment terms negotiate karo — cash pe discount, credit pe flexibility`,
          `Quality check receiving pe hi karo — ghar laake reject karna mushkil hai`,
          `Bulk buying sirf tab jab storage accha ho — warna sasta material kharab ho jaata hai`,
          `Har mahine rate review karo — seasonal items ka rate ${ri(r,20,60)}% swing karta hai`,
          `Ek supplier se relationship rakho — emergency me wahi kaam aata hai`
        ], 4) },
        { t: 'kv', v: [
          ['Material cost target', ri(r,35,48) + '% of selling price'],
          ['Suppliers to maintain', ri(r,3,5) + ' (har item ke liye)'],
          ['Rate review', 'Mahine me 1 baar'],
          ['Potential saving', ri(r,8,20) + '% material cost pe']
        ]},
        { t: 'hl', v: `Pro tip: ${t.raw.slice(0,2).join(' aur ')} ka rate weekly note karo. 3 mahine ka data aapko bata dega ki kab khareedna hai aur kab rukna hai.` },
        { t: 'quote', v: pick(r, CTAS) }
      ]
    };
  };

  /* ---- 20. Product / menu design ---- */
  P.menu = function (c) {
    const { t, r } = c;
    return {
      tag: 'Product & Menu',
      title: pick(r, [`${t.name}: menu/variety kitni honi chahiye?`, `${t.name} me naya item kab launch karein?`, `${t.name}: product mix jo profit badhata hai`]),
      blocks: [
        { t: 'p', v: `Zyada variety = zyada waste + zyada confusion. ${t.name} me ${ri(r,5,9)} strong items ${ri(r,20,40)} average items se zyada kamate hain.` },
        { t: 'steps', v: [
          `1. Apne saare items ki monthly sales nikalo — 20% items 80% revenue dete hain (80/20 rule)`,
          `2. Bottom 20% items ko hatane ka socho — ya unhe combo me use karo`,
          `3. Ek "hero item" banao — jiske liye log door se aayein. Uspe 2x quality focus`,
          `4. Ek "high-margin item" banao — cost kam, price zyada. Ye profit engine hai`,
          `5. Har 3 mahine me ek naya item test karo — 15 din trial, phir decide`
        ]},
        { t: 'li', v: picks(r, [
          `Combo banao: ${t.name} + add-on. Average bill ${ri(r,18,40)}% badhta hai bina extra marketing ke`,
          `Menu board pe "high-margin item" ko eye-level pe rakho — customer wahin dekhta hai`,
          `Rate card me beech wala option sabse zyada bikta hai (3 options rakho)`,
          `Seasonal limited item launch karo — urgency create hoti hai`,
          `Customer se pucho "kya add karein?" — sabse sasta R&D`
        ], 3) },
        { t: 'hl', v: `Menu psychology: 3 options me customer middle choose karta hai. Isliye apna high-margin item beech me rakho.` },
        { t: 'quote', v: pick(r, CTAS) }
      ]
    };
  };

  /* ---- 21. Utilities & equipment ---- */
  P.utility = function (c) {
    const { t, r } = c;
    return {
      tag: 'Equipment & Utilities',
      title: pick(r, [`${t.name}: equipment kahan se aur kaunsa lein?`, `${t.name} me bijli ka bill kaise kam karein?`, `${t.name}: machine maintenance ka plan`]),
      blocks: [
        { t: 'p', v: `${t.name} me equipment ek baar ka kharcha nahi — maintenance aur bijli roz ka kharcha hai. Ye dono chhupa hua profit killer hain.` },
        { t: 'kv', v: [
          ['Key equipment', t.equip.slice(0, 3).join(', ')],
          ['Monthly bijli bill', inr(round500(ri(r, 2000, 18000)))],
          ['Maintenance budget', inr(round500(ri(r, 800, 4000))) + '/mahine'],
          ['Equipment life', ri(r,4,9) + ' saal (agar maintain kiya)'],
          ['Power backup', pick(r, ['Inverter (basic)', 'Generator (essential)', 'UPS for billing only'])]
        ]},
        { t: 'li', v: picks(r, [
          `Naya vs 2nd-hand: ${t.equip[0]} jaisi heavy cheez 2nd-hand lo, par warranty/service wale se`,
          `Servicing ka fixed schedule banao — breakdown business ke din me hota hai, kabhi chhutti me nahi`,
          `LED lights + star-rated equipment — ₹${ri(r,3000,15000)} ka investment 6 mahine me wapas aa jaata hai`,
          `Power backup zaroori hai — 1 ghante ki bandi ka nuksaan ₹${ri(r,500,5000)} hota hai`,
          `Har equipment ka service number phone me save karo — emergency me search karne ka time nahi hota`,
          `Equipment pe insurance le lo — chhoti si premium, bada nuksaan bachata hai`
        ], 4) },
        { t: 'hl', v: `Rule: har equipment ka ek "service card" banao — kab khareeda, kab service hui, kitna kharcha hua. Ye card resale value bhi badhata hai.` },
        { t: 'quote', v: pick(r, CTAS) }
      ]
    };
  };

  /* ---- 22. Risk ---- */
  P.risk = function (c) {
    const { t, r } = c;
    return {
      tag: 'Risk & Safety',
      title: pick(r, [`${t.name}: khatre aur unse bachne ke tareeke`, `${t.name} me risk management`, `${t.name}: kya galat ho sakta hai? (aur plan kya hai)`]),
      blocks: [
        { t: 'p', v: `Business me risk khatam nahi hota — sirf manage hota hai. ${t.name} me ${ri(r,3,5)} bade risk hote hain, aur har ek ka ek simple backup plan ho sakta hai.` },
        { t: 'kv', v: t.risks.slice(0,4).map(rk => [rk, pick(r, ['Backup plan banao','Diversify karo','Buffer rakho','Insurance lo'])]) },
        { t: 'li', v: picks(r, [
          `Shop/business insurance lo — ₹${ri(r,2000,8000)}/saal me aag, chori aur natural damage cover hota hai`,
          `Cash roz bank me jama karo — counter pe zyada cash mat rakho`,
          `CCTV lagao — ₹${ri(r,6000,20000)} ka kharcha, par theft aur dispute dono me kaam aata hai`,
          `Staff pe 100% depend mat raho — khud har kaam seekho`,
          `Ek emergency fund rakho — 3 mahine ka fixed cost, alag account me`,
          `Data ka backup rakho — billing, customer list, supplier contacts`
        ], 4) },
        { t: 'hl', v: `Sabse bada risk jo log nahi dekhte: khud beemar ho jana. Isliye business ko "owner-independent" banana zaroori hai — warna aapki chhutti = business band.` },
        { t: 'quote', v: pick(r, CTAS) }
      ]
    };
  };

  /* ---- 23. Case study (story format) ---- */
  P.story = function (c) {
    const { t, r, region } = c;
    const names = ['Rakesh','Sunita','Imran','Deepak','Kavita','Anil','Pooja','Farhan','Mahesh','Neha','Suresh','Rekha','Vikram','Ayesha'];
    const nm = pick(r, names);
    const city = region ? pick(r, region.cities) : pick(r, ['apne shahar','tier-2 city','chhote town']);
    const yrs = ri(r, 2, 9);
    const start = round500(ri(r, t.setup[0], t.setup[1]));
    const now = round500(start * rf(r, 2.2, 5));
    return {
      tag: 'Real Story',
      title: pick(r, [`${nm} ki kahani: ${t.name} se ${inr(now)} tak`, `${city} me ${t.name} — ek asli journey`, `₹${start} se shuru kiya, aaj ${yrs} saal baad...`]),
      blocks: [
        { t: 'p', v: `${nm} ne ${yrs} saal pehle ${city} me ₹${start} se ${t.name.toLowerCase()} shuru kiya. Na koi background, na koi experience. Aaj wahi kaam ${inr(now)} ke setup pe chalta hai. Beech me jo seekha, wahi yahan hai.` },
        { t: 'quote', v: `"Pehle 6 mahine mujhe laga main galat jagah hoon. Roz lagta tha band kar doon. Phir maine ek register rakhna shuru kiya — aur tab pata chala ki problem business nahi, mera hisaab tha." — ${nm}` },
        { t: 'steps', v: [
          `Saal 1: Chhote setup se shuru. Sirf ${ri(r,2,4)} items. Khud sab kaam kiya — cooking se billing tak.`,
          `Saal 2: Pehla staff rakha. Yahan sabse badi galti ki — bina SOP ke. 3 bande gaye 6 mahine me.`,
          `Saal 3: Systems banaye — written recipe, daily register, fixed supplier. Sales ${ri(r,40,90)}% badhi.`,
          `Saal ${ri(r,4,yrs)}: Setup upgrade kiya. Aur ek naya revenue channel (B2B/delivery) add kiya.`,
          `Aaj: ${ri(r,t.staff[0],t.staff[1])} log, stable profit, aur business owner ke bina bhi chalta hai.`
        ]},
        { t: 'li', v: [
          `"Sabse pehle hisaab seekho, business baad me."`,
          `"Jaldi mat karo. Maine 2 saal jaldi ki, 1 saal peeche ho gaya."`,
          `"Customer ki shikayat suno — wahi free consulting hai."`,
          `"Apni salary fix karo. Warna 5 saal baad pata chalega ki aap free me kaam kar rahe the."`
        ]},
        { t: 'hl', v: `${nm} ki sabse badi seekh: "Business bada karne se pehle, business ko apne bina chalana seekho."` },
        { t: 'quote', v: pick(r, CTAS) }
      ]
    };
  };

  /* ---- 24. Opening day checklist ---- */
  P.checklist = function (c) {
    const { t, r } = c;
    return {
      tag: 'Opening Checklist',
      title: pick(r, [`${t.name}: opening day ki poori checklist`, `${t.name} kholne se pehle ye ${ri(r,12,18)} cheezein check karo`, `${t.name}: day-1 ke liye ready ho?`]),
      blocks: [
        { t: 'p', v: `Opening day sabse zyada log aate hain — aur pehla impression hi tay karta hai ki wo wapas aayenge ya nahi. Ye checklist 2 hafte pehle se follow karo.` },
        { t: 'li', v: [
          'Licence + registration complete (print copy counter pe)',
          'Bank current account + UPI QR working test',
          'Sabhi equipment 2 baar test run',
          'Staff training complete + dress code ready',
          'Raw material ka 1 hafta ka stock',
          'Google Business Profile live + photos uploaded',
          'Opening offer ka board/banner ready',
          'Nearby 200 ghar/dukaan pe pamphlet distribute',
          'WhatsApp broadcast list (min 50 numbers)',
          'Cash float + change (chhutte paise)',
          'First-aid box + fire extinguisher',
          'Complaint handling ka plan (kaun sunega, kya karega)',
          'Daily register + waste register ready',
          'CCTV / security arrangement'
        ]},
        { t: 'hl', v: `Opening week me profit ka mat socho — sirf impression ka socho. Pehle 7 din me ${ri(r,150,600)} logon ko serve karo, quality pe zero compromise. Ye aapka free marketing hai.` },
        { t: 'kv', v: [
          ['Prep time', ri(r,20,45) + ' din'],
          ['Opening offer', ri(r,10,30) + '% off ya free item'],
          ['Target day-1 footfall', ri(r,80,350) + ' log'],
          ['Review target (week 1)', ri(r,10,30) + ' Google reviews']
        ]},
        { t: 'quote', v: pick(r, CTAS) }
      ]
    };
  };

  /* ---- 25. Local angle ---- */
  P.local = function (c) {
    const { t, r, region } = c;
    if (!region) return null;
    return {
      tag: region.label + ' Special',
      title: pick(r, [`${t.name} in ${region.city}: local market ka sach`, `${region.label} me ${t.name} ka business kaisa chalega?`, `${region.city} ke liye ${t.name} — area-specific plan`]),
      blocks: [
        { t: 'p', v: `${region.label} ka market baaki India se alag hai. Yahan ka taste, timing aur buying behaviour samjhe bina ${t.name.toLowerCase()} shuru karna andhere me teer chalana hai.` },
        { t: 'li', v: region.flavour.map(f => f) },
        { t: 'kv', v: [
          ['Key cities', region.cities.slice(0, 4).join(', ')],
          ['Biggest local season', (region.festivals[0] || 'Diwali')],
          ['Local advantage', region.note.slice(0, 90) + '...'],
          ['Suggested start', pick(r, region.cities.slice(0, 3))]
        ]},
        { t: 'hl', v: region.note },
        { t: 'steps', v: [
          `1. Apne ${ri(r,2,5)} km radius ke saare ${t.name.toLowerCase()} businesses ka map banao`,
          `2. 3 alag time pe footfall count karo (subah/dopahar/shaam)`,
          `3. Local logon se pucho: "yahan kya cheez missing hai?"`,
          `4. Local taste ke hisaab se apne product me 1-2 tweak karo`,
          `5. Local festival calendar ko apna business calendar banao`
        ]},
        { t: 'quote', v: pick(r, CTAS) }
      ]
    };
  };

  /* ---- 26. Myth vs fact ---- */
  P.myth = function (c) {
    const { t, r } = c;
    const ms = picks(r, MYTHS, 3);
    return {
      tag: 'Myth vs Reality',
      title: pick(r, [`${t.name}: 3 jhooth jo sab mante hain`, `${t.name} ke baare me galat fehmiyan`, `Ye sochna band karo — ${t.name} reality check`]),
      blocks: [
        { t: 'p', v: `${t.name} shuru karne se pehle log YouTube aur doston se jo sunte hain, usme se aadha galat hota hai. Ye 3 sabse common hain.` },
        ...ms.map(m => ({ t: 'myth', m: m.m, r: m.r })),
        { t: 'hl', v: `Ek line me: ${t.name} me koi shortcut nahi hai. Sirf consistent daily discipline hai — aur wahi boring cheez paisa banati hai.` },
        { t: 'quote', v: pick(r, CTAS) }
      ]
    };
  };

  /* ---- 27. Daily habits ---- */
  P.habits = function (c) {
    const { t, r } = c;
    return {
      tag: 'Daily Habits',
      title: pick(r, [`${t.name}: owner ki 7 daily aadatein`, `Jo ${t.name} owner ye karte hain, wo tikte hain`, `${t.name} me successful log roz ye karte hain`]),
      blocks: [
        { t: 'p', v: `Bade business decisions saal me 2-3 baar hote hain. Baaki sab kuch daily habits ka result hai. ${t.name} me ye aadatein sabse zyada matter karti hain.` },
        { t: 'li', v: picks(r, HABITS, 5) },
        { t: 'kv', v: [
          ['Time needed daily', ri(r,45,90) + ' min (business ke alawa)'],
          ['Sabse important habit', 'Roz ke 3 numbers likhna'],
          ['Review frequency', 'Hafte me 1 baar full review'],
          ['Result dikhega', ri(r,60,90) + ' din me']
        ]},
        { t: 'hl', v: `21 din challenge: agle 21 din tak sirf ye karo — daily sales, kharcha, waste likhna + ek customer se baat karna. 22ve din aapka business alag dikhega.` },
        { t: 'quote', v: pick(r, CTAS) }
      ]
    };
  };

  const PILLAR_ORDER = ['idea','investment','pricing','ops','staff','hygiene','legal','marketing','quality','location','season','mistakes','scale','digital','finance','competition','waste','customer','sourcing','menu','utility','risk','story','checklist','local','myth','habits'];

  /* ================= CONCISE BILINGUAL TIP-CARDS ====================== */
  /* Har card = EK punchy tip (Hindi + English) + ek real number.        */
  const L = (hi, en) => ({ hi, en });

  const CARD_PILLARS = [
    { key:'margin', tag:L('💰 Margin','Margin'), tips:[
      c=>{ const cost=round5(ri(c.r,c.t.unitCost[0],c.t.unitCost[1])); const price=round5(Math.max(c.t.unitPrice[0],Math.round(cost*rf(c.r,1.8,2.6)))); const p=price-cost;
        return { hi:`${c.hn} की cost ${inr(cost)}, बिकता ${inr(price)} — हर ${c.t.unitName} पे ${inr(p)} कमाओ।`, en:`Costs ${inr(cost)}, sells at ${inr(price)} — you earn ${inr(p)} per ${c.t.unitName}.`, stat:{v:inr(p), hi:'प्रति '+c.t.unitName+' मुनाफ़ा', en:'profit per '+c.t.unitName} }; },
      c=>{ const m=ri(c.r,c.t.margin[0],c.t.margin[1]); return { hi:`${c.hn} में healthy margin ${m}% है — इससे नीचे rate मत तोड़ो।`, en:`A healthy margin in ${c.en} is ${m}% — never price below it.`, stat:{v:m+'%', hi:'target margin', en:'target margin'} }; },
      c=>{ const w=ri(c.r,3,8); return { hi:`Waste को cost में ${w}% ज़रूर जोड़ो — ${c.hn} में बर्बादी होती ही है।`, en:`Add ${w}% for waste in your cost — spoilage is inevitable in ${c.en}.`, stat:{v:w+'%', hi:'waste buffer', en:'waste buffer'} }; },
      c=>({ hi:`Rate competitor से नहीं, अपने cost + margin से set करो।`, en:`Price from your cost + margin, not from your competitor.`, stat:null })
    ]},
    { key:'money', tag:L('🏦 Investment','Investment'), tips:[
      c=>{ const s=round500(ri(c.r,c.t.setup[0],c.t.setup[1])); return { hi:`${c.hn} शुरू करने के लिए लगभग ${inr(s)} चाहिए — आधा equipment, आधा working capital।`, en:`Starting ${c.en} needs ~${inr(s)} — half equipment, half working capital.`, stat:{v:inr(s), hi:'कुल setup', en:'total setup'} }; },
      c=>{ const pc=ri(c.r,20,30); return { hi:`Setup cost का ${pc}% अलग रखो working capital के लिए — वरना 3 महीने में cash ख़त्म।`, en:`Keep ${pc}% of setup aside as working capital — else cash runs dry in 3 months.`, stat:{v:pc+'%', hi:'working capital', en:'working capital'} }; },
      c=>({ hi:`2nd-hand equipment से ${c.hn} में 40–60% बचाओ — नया बाद में लेना।`, en:`Save 40–60% with used equipment in ${c.en} — upgrade later.`, stat:{v:'40-60%', hi:'बचत', en:'saving'} }),
      c=>({ hi:`Loan चाहिए तो MUDRA/PMEGP देखो — collateral-free मिलता है।`, en:`Need a loan? See MUDRA/PMEGP — collateral-free for small business.`, stat:null })
    ]},
    { key:'time', tag:L('⏰ Timing','Timing'), tips:[
      c=>({ hi:`${c.hn} में peak ${c.t.peak[0]} है — उस वक़्त 100% focus सिर्फ़ selling पे।`, en:`Peak for ${c.en} is ${c.t.peak[0]} — focus only on selling then.`, stat:null }),
      c=>({ hi:`Peak से पहले सारा prep ready रखो — rush में prep नहीं होता।`, en:`Finish all prep before peak — you can't prep during the rush.`, stat:null }),
      c=>({ hi:`रोज़ same time खुलो — customer habit से आता है।`, en:`Open at the same time daily — customers come by habit.`, stat:null })
    ]},
    { key:'mkt', tag:L('📣 Free Marketing','Marketing'), tips:[
      c=>({ hi:`Google Business Profile FREE है — "${c.en} near me" पे सबसे पहले दिखो।`, en:`Google Business Profile is free — rank first for "${c.en} near me".`, stat:null }),
      c=>({ hi:`WhatsApp broadcast से एक message में सारे regular customers तक पहुँचो।`, en:`One WhatsApp broadcast reaches all your regulars at once.`, stat:null }),
      c=>({ hi:`हर happy customer से review माँगो — review ही असली advertising है।`, en:`Ask every happy customer for a review — reviews are the real ads.`, stat:null }),
      c=>({ hi:`"दोस्त को लाओ, दोनों को छूट" — सबसे सस्ती marketing।`, en:`"Bring a friend, both get a discount" — the cheapest marketing.`, stat:null })
    ]},
    { key:'mistake', tag:L('⚠️ Galti Mat Karo','Avoid This'), tips:[
      c=>({ hi:`हिसाब न लिखना सबसे बड़ी ग़लती — रोज़ sales, ख़र्चा, waste लिखो।`, en:`Not writing accounts is the biggest mistake — log sales, cost, waste daily.`, stat:null }),
      c=>({ hi:`बिना limit के उधार मत दो — cash flow मर जाता है।`, en:`Don't give unlimited credit — it kills your cash flow.`, stat:null }),
      c=>({ hi:`पहले महीने के profit पे scale मत करो — वो honeymoon hota है।`, en:`Don't scale on month-one profit — that's just the honeymoon.`, stat:null }),
      c=>({ hi:`Staff पे 100% निर्भर मत रहो — हर काम ख़ुद भी सीखो।`, en:`Never depend 100% on staff — learn every job yourself.`, stat:null })
    ]},
    { key:'quality', tag:L('⭐ Quality','Quality'), tips:[
      c=>({ hi:`3 अलग customers की same शिकायत = आपका system ग़लत है।`, en:`3 customers, same complaint = your system is wrong.`, stat:{v:'3', hi:'same complaints = fix', en:'same complaints = fix'} }),
      c=>({ hi:`"अंदाज़ा" नहीं, measuring use करो — scale + cup से consistency।`, en:`Don't guess, measure — scale + cup give consistency.`, stat:null }),
      c=>({ hi:`Pehla batch ख़ुद taste/test करो — पहला ख़राब तो दिन ख़राब।`, en:`Taste/test the first batch yourself — a bad first batch ruins the day.`, stat:null })
    ]},
    { key:'customer', tag:L('❤️ Customer','Customer'), tips:[
      c=>({ hi:`Customer का नाम याद रखो — free है, और सबसे powerful।`, en:`Remember your customer's name — free, and most powerful.`, stat:null }),
      c=>{ const n=ri(c.r,8,12); return { hi:`Loyalty card: ${n} पे 1 free — ${c.hn} में बहुत चलता है।`, en:`Loyalty card: ${n}th one free — works great in ${c.en}.`, stat:{v:n+'→1', hi:'buy get free', en:'buy get free'} }; },
      c=>({ hi:`नया customer लाना, पुराने को लौटाने से 5x महँगा है।`, en:`Winning a new customer costs 5x more than keeping an old one.`, stat:{v:'5x', hi:'new vs old cost', en:'new vs old cost'} })
    ]},
    { key:'legal', tag:L('📜 Paperwork','Paperwork'), tips:[
      c=>({ hi:`Udyam Registration FREE है — 10 मिनट में online, MSME benefits मिलते हैं।`, en:`Udyam registration is free — online in 10 min, gives MSME benefits.`, stat:null }),
      c=>({ hi:`${c.t.licenses[0]} सबसे पहले लो — fine से सस्ता है।`, en:`Get ${c.t.licenses[0]} first — it's cheaper than the fine.`, stat:null }),
      c=>({ hi:`Business और personal पैसा अलग account में रखो।`, en:`Keep business and personal money in separate accounts.`, stat:null })
    ]},
    { key:'staff', tag:L('👥 Staff','Staff'), tips:[
      c=>{ const n=ri(c.r,c.t.staff[0],c.t.staff[1]); const person=n===1?'व्यक्ति':'लोग'; return { hi:`शुरुआत में ${n} ${person} काफ़ी: ${c.t.staffRoles.slice(0,n).join(', ')}।`, en:`Start with ${n}: ${c.t.staffRoles.slice(0,n).join(', ')}.`, stat:{v:n, hi:'शुरुआती team', en:'starting team'} }; },
      c=>({ hi:`Salary के साथ छोटा incentive रखो — output 20–30% बढ़ता है।`, en:`Add a small incentive to salary — output jumps 20–30%.`, stat:null }),
      c=>({ hi:`Payment date कभी मत तोड़ो — एक बार late, trust ख़त्म।`, en:`Never miss payday — one late payment kills trust.`, stat:null })
    ]},
    { key:'local', tag:L('📍 Aapka Ilaka','Local'), tips:[
      c=> c.region ? { hi:`${c.region.label} में ${c.region.festivals[0]} के समय demand ${ri(c.r,2,4)}x हो जाती है — पहले से तैयार रहो।`, en:`In ${c.region.label}, demand goes 2–4x during ${c.region.festivals[0]} — prepare early.`, stat:null } : { hi:`अपने 2 km radius का survey ख़ुद करो — वही असली data है।`, en:`Survey your 2 km radius yourself — that's the real data.`, stat:null },
      c=> c.region ? { hi:`${c.region.city} जैसे शहर में rent कम, space ज़्यादा मिलता है — फ़ायदा उठाओ।`, en:`In cities like ${c.region.city}, rent is lower and space bigger — use it.`, stat:null } : { hi:`Local taste के हिसाब से 1–2 tweak करो — बाहर वाला copy मत करो।`, en:`Tweak 1–2 things for local taste — don't copy outsiders.`, stat:null },
      c=>({ hi:`Local festival calendar ही आपका business calendar है।`, en:`Your local festival calendar is your business calendar.`, stat:null })
    ]}
  ];

  function generateCard(area, regionText, index, userSeed) {
    const t = resolveTopic(area);
    const region = resolveRegion(regionText);
    const seedStr = `${userSeed}|card|${t.key}|${area}|${index}`;
    const r = mulberry32(hashStr(seedStr));
    // pillar strictly rotate (consecutive alag), tip topic+index se vary
    const pillar = CARD_PILLARS[index % CARD_PILLARS.length];
    const tips = pillar.tips;
    const tip = tips[(index + hashStr(t.key + area)) % tips.length];
    const c = { t, region, r, hn: t.hindi, en: t.name };
    const built = tip(c);
    // fix any placeholder oddities
    if (built.stat && built.en) built.en = built.en.replace(/\$\{\s*\}/g, '2–');
    const audio = built.hi + ' ' + (built.stat ? built.stat.hi + ' ' + built.stat.v + '.' : '');
    return {
      id: hashStr(seedStr).toString(36) + '-' + index,
      area, topic: t, region,
      tag: pillar.tag,
      tip: { hi: built.hi, en: built.en },
      stat: built.stat || null,
      audio,
      emoji: t.emoji,
      artSeed: hashStr(seedStr + 'art')
    };
  }

  function generateCards(areas, regionText, count, userSeed, offset) {
    offset = offset || 0;
    const out = [];
    for (let i = 0; i < count; i++) {
      const idx = offset + i;
      out.push(generateCard(areas[idx % areas.length], regionText, idx, userSeed));
    }
    return out;
  }

  /* ================= POST GENERATOR ==================================== */
  function generatePost(area, regionText, index, userSeed) {
    const t = resolveTopic(area);
    const region = resolveRegion(regionText);
    const seedStr = `${userSeed}|${t.key}|${area}|${region ? region.label : ''}|${index}`;
    const r = mulberry32(hashStr(seedStr));

    // Pick a pillar, rotating so the feed never repeats the same topic nearby
    const pi = (index + hashStr(t.key + userSeed)) % PILLAR_ORDER.length;
    const pillarKey = PILLAR_ORDER[pi];
    let built = P[pillarKey] ? P[pillarKey](ctxFor(t, region, r)) : null;
    if (!built) built = P.idea(ctxFor(t, region, r));

    // Audio narration text (Hinglish)
    const paras = built.blocks.filter(b => b.t === 'p' || b.t === 'hl').map(b => b.v);
    const listItems = (built.blocks.find(b => b.t === 'li') || { v: [] }).v.slice(0, 2);
    const audio = [built.title + '.'].concat(paras, listItems.map(x => 'Point: ' + x + '.')).join(' ').replace(/[₹]/g, ' rupaye ').replace(/\s+/g, ' ').trim();

    // Reel slides
    const slides = [{ h: built.title, s: built.tag, kind: 'title' }];
    built.blocks.forEach(b => {
      if (b.t === 'p') slides.push({ h: b.v.length > 150 ? b.v.slice(0, 147) + '…' : b.v, s: built.tag, kind: 'text' });
      else if (b.t === 'li') b.v.slice(0, 4).forEach(v => slides.push({ h: v, s: built.tag, kind: 'bullet' }));
      else if (b.t === 'kv') slides.push({ h: b.v.slice(0, 4).map(x => x[0] + ': ' + x[1]).join('  •  '), s: built.tag, kind: 'kv' });
      else if (b.t === 'myth') slides.push({ h: b.r, s: 'Myth: ' + b.m, kind: 'text' });
    });
    slides.push({ h: 'Follow karo — roz naye business ideas.', s: built.tag, kind: 'cta' });

    return {
      id: hashStr(seedStr).toString(36) + '-' + index,
      area: area,
      topic: t,
      region: region,
      tag: built.tag,
      title: built.title,
      blocks: built.blocks,
      audio: audio,
      slides: slides.slice(0, 9),
      artSeed: hashStr(seedStr + 'art'),
      likes: 40 + (hashStr(seedStr + 'l') % 1800),
      readMin: Math.max(1, Math.round(audio.split(' ').length / 90)),
      postedAgo: pick(r, ['abhi', '5 min pehle', '1 ghanta pehle', '3 ghante pehle', 'aaj subah', 'kal', '2 din pehle'])
    };
  }

  function generateFeed(areas, regionText, count, userSeed, offset) {
    offset = offset || 0;
    const out = [];
    for (let i = 0; i < count; i++) {
      const idx = offset + i;
      const area = areas[idx % areas.length];
      out.push(generatePost(area, regionText, idx, userSeed));
    }
    return out;
  }

  /* Suggested areas of interest */
  const SUGGESTIONS = {
    'Food & Snacks': ['Samosa','Chai','Poha','Idli','Dosa','Momos','Jalebi','Biryani','Chaat','Ice Cream','Juice & Shake','Bakery','Mithai (Sweets)','Tiffin Service'],
    'Hotel & Places': ['Hotel','Restaurant','Cafe','Gym','Salon / Parlour','Resort','Banquet Hall','Hostel / PG'],
    'Services': ['Coaching / Tuition','Tailoring / Boutique','Laundry','Printing / Xerox','Event Management','Driving School','Photography'],
    'Retail & Shops': ['Kirana Store','Medical Store','Mobile Shop','Dairy / Milk Booth','Plant Nursery','Furniture Shop','Clothing Store']
  };

  global.DhandhaEngine = {
    generatePost, generateFeed, resolveTopic, resolveRegion,
    generateCard, generateCards,
    SUGGESTIONS, PILLARS: PILLAR_ORDER, inr,
    _internal: { mulberry32, hashStr }
  };
})(typeof window !== 'undefined' ? window : globalThis);
