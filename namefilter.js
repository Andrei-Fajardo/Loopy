/* Name check for the names players give their collected animals (Meta.checkName).
   Blocks slurs, swear words, sexual words, hate symbols, links and phone numbers in many languages. It is a blocklist, so it is
   never complete; the point is that a child-friendly game should not take the obvious ones, including the usual disguises:
   spacing (f u c k), stretching (fuuuck), leetspeak (sh1t), accents (cabrón), lookalike letters (Cyrillic а for a) and
   zero-width characters.
   Two lists per language:
     BAD    long or distinctive words, matched anywhere inside the name with spaces and punctuation removed
     TOKENS short or innocent-looking-inside-longer-words (dick, rape, cock, anal), matched only as a whole word
   Add words by appending to the strings below; no other code needs to change. Works in the browser and in node (tests). */
(() => {
  // ---------- word lists (lowercase, no accents; the name is folded the same way before matching) ----------
  const BAD = {
    en: `fuck motherfuck shit bullshit bitch bastard asshole jackass dumbass fatass dickhead cocksucker whore slut pussyfart bollock twatwaffle
      nigg niga negr0 chingchong faggot tranny shemale retard wetback towelhead raghead sandnigg cameljockey paki beaner
      penis vagina dildo blowjob handjob cumshot jizz orgasm masturbat erection porn hentai milf nudes sexting boner
      rapist molest paedophile pedophile pedobear incest killyourself suicid hangyourself
      nazi hitler heilhitler adolf1488 kukluxklan whitepower whitepride gaschamber`,
    es: `putada mierda pendejo pendeja cabron cabrona chingar chingada chinga chingue joder jodete culero marica maricon mamabicho
      gilipollas gilipolla hijodeputa hijueputa hijoputa carajo boludo pelotudo concha tumadre negrata sudaca mongolico follar coger mierda`,
    fr: `merde putain salope connard connasse encule enculer niquer nique couille foutre pedale bougnoule youpin batard branleur
      fdp tagueule nikmok nique`,
    de: `scheisse scheiss arschloch arsch fotze schlampe hurensohn wichser ficken ficker schwuchtel kanake nutte missgeburt spast
      judensau heilhitler`,
    pt: `porra caralho buceta foda fodase foder viado cuzao arrombado merda filhodaputa vadia piroca punheta crioulo bicha corno
      vtnc vsf`,
    it: `cazzo merda stronzo stronza puttana troia vaffanculo fottere minchia frocio figadilegno porcodio porcamadonna madonnaputtana
      coglione bocchino`,
    nl: `klootzak kanker hoer neuken flikker mongool godverdomme kut lul tyfus kankerlijer`,
    tl: `putang putangina tangina tanginamo tangna tarantado pakyu pakshet pakingshet punyeta bwisit buwisit kantot kantutan jakol
      hinayupak lintik kupal pokpok iyot tamod burat hayupak gagu`,
    id: `bangsat bajingan kontol memek ngentot jancok jancuk brengsek pukimak keparat bangke sundal lonte perek kimak cibai`,
    tr: `orospu siktir sikerim sikeyim amina amcik yarrak pezevenk gavat kahpe serefsiz yavsak gerizekali ibne`,
    pl: `kurwa chuj jebac pierdol pierdolic pizda skurwysyn spierdalaj`,
    ro: `muie futut pizda curva labagiu`,
    vi: `dumay ditme dcm vcl conchó`,
    sv: `fitta knullar helvete jaevla javla kuksugare`,
    hi: `madarchod behenchod bhenchod chutiya chutiye gandu randi bhosdi bhosda bhosdike lauda haramzada harami lund gaand bhadwa
      maderchod betichod`,
    ar: `sharmouta sharmuta sharmoota kahba ayre tizi zebi manyak ibnsharmouta ibnelkalb`,
    ru: `blyat blyad blat pizdec pizda pidor pidar pidaras gandon zalupa shlyukha ebat ebal ebanat ebanyi yobany nahuy nahui nakhuy mudak
      cyka suka`,
    ko: `ssibal sibal shibal byungshin gaesaekki jiral`,
    ja: `chinko manko chinpo kichigai`,
    zh: `caonima tamade shabi nmsl wocao jianhuo biaozi jiba`,
    // other scripts: matched on the name as typed (spaces and punctuation removed)
    ruNative: `хуй хуя хуе хуи пизд ебат ебан ебал еблан блять бляд блят сука суки мудак мудил пидор пидар пидр гандон залуп шлюх дроч
      ублюд выблядок сучар мразь долбоеб долбаеб нахуй нахер говно`,
    uk: `хуйло курва підар підор бляха їбат`,
    arNative: `شرموط شرموطة قحبة قحبه عرص منيك منيوك كسمك كس امك زب نيك ابن الكلب ابن المتناكة متناك`,
    hiNative: `मादरचोद बहनचोद चूतिया चुतिया गांडू गांड रंडी भोसड लौड़ा लंड हरामी हरामज़ादा`,
    koNative: `씨발 시발 병신 개새끼 좆 지랄 창녀 새끼 느금마`,
    jaNative: `ちんこ まんこ ちんぽ きちがい 死ね 殺す チンコ マンコ チンポ キチガイ`,
    zhNative: `操你 草你 他妈的 他媽的 妈的 媽的 傻逼 傻屄 我操 我草 婊子 鸡巴 雞巴 屌 去死 肏 贱人 賤人 狗娘 干你娘 幹你娘 日你 杂种 雜種 废物`,
    thNative: `ควย หี เหี้ย สัส แม่ง เย็ด พ่อมึง แม่มึง`,
    el: `μαλακα πουτανα γαμω αρχιδι`,
    he: `זונה כוסית מניאק בן זונה זין`,
  };
  const TOKENS = {
    en: `fuk fck fvck fuc wtf stfu omfg dick dicks cock cocks pussy pussies cunt cunts cunty tit tits titty titties boob boobs ass arse anus
      anal sex sexy sexual sexx nude naked horny cum cums rape raped raping prick twat wank wanker wankers piss pissed pisser crap
      damn dammit hell fag fags dyke kike spic spick chink gook coon negro nigger jap kys kms kkk 1488 retard retarded tard spastic
      pedo paedo creampie hoe thot slag skank tramp hooker pimp whorehouse screw tard cunnilingus bj`,
    es: `puto puta putas verga mamada polla pene hdp coño cono zorra`,
    fr: `bite pute pd negre salaud`,
    de: `fick neger schwul`,
    pt: `cu pau pica`,
    it: `figa culo finocchio negro`,
    tl: `gago gaga ulol puta puke titi tite peste shunga engot negro intsik tangina`,
    id: `tai goblok tolol`,
    tr: `sik amk oc pic pust`,
    pl: `dupa cipa debil kutas suka`,
    ro: `pula fut`,
    vi: `dit deo cac`,
    sv: `kuk hora faen`,
    hi: `chut mc bc`,
    ar: `kos kuss`,
    ru: `huy khuy hui`,
    ko: ``,
    ja: `kuso`,
    zh: `sb cnm`,
    nl: `nikker`,
  };

  // ---------- folding ----------
  // Lookalike letters from other scripts that people type to dodge a filter, mapped to the Latin letter they imitate.
  const LOOK = {
    'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y', 'і': 'i', 'ј': 'j', 'к': 'k', 'м': 'm', 'н': 'h', 'т': 't', 'в': 'b', 'ѕ': 's',
    'α': 'a', 'ο': 'o', 'ρ': 'p', 'ν': 'v', 'ι': 'i', 'κ': 'k', 'τ': 't', 'υ': 'u', 'ε': 'e', 'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'ø': 'o', 'ð': 'd', 'þ': 'th', 'ł': 'l', 'đ': 'd', 'ı': 'i',
  };
  // Leetspeak. A "1" can be an i or an l, so both readings are checked.
  const LEET = { '0': 'o', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '@': 'a', '$': 's', '+': 't', '€': 'e', '¡': 'i', '!': 'i', '|': 'i' };
  const strip = s => s.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[\p{Cf}​-‏⁠﻿]/gu, '').toLowerCase();
  const fold = (s, one) => [...strip(s)].map(ch => LOOK[ch] || (ch === '1' ? one : LEET[ch]) || ch).join('');
  const letters = s => s.replace(/[^\p{L}\p{N}]/gu, '');
  const words = str => str.split(/\s+/).filter(Boolean);
  const esc = ch => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // A word becomes a pattern that lets every letter repeat (fuuuck), but still needs each letter once.
  const stretch = w => [...strip(w)].map(ch => esc(ch) + '+').join('');

  const latinBad = [], nativeBad = [], tok = [];
  for (const [k, v] of Object.entries(BAD)) for (const w of words(v)) (/^[\p{Script=Latin}\p{N}]+$/u.test(strip(w)) ? latinBad : nativeBad).push(w);
  for (const v of Object.values(TOKENS)) for (const w of words(v)) tok.push(w);
  const badRe = new RegExp(latinBad.map(stretch).join('|'), 'u');
  const nativeRe = new RegExp(nativeBad.map(w => esc(strip(w).replace(/[^\p{L}\p{N}]/gu, ''))).join('|'), 'u');
  const tokRe = new RegExp('^(?:' + tok.map(stretch).join('|') + ')$', 'u');

  // ---------- the check ----------
  const MAX = 14;
  function checkName(raw) {
    const name = String(raw || '').replace(/[\s　]+/g, ' ').trim();
    if (!name) return { ok: false, why: 'Give it a name first.' };
    if ([...name].length > MAX) return { ok: false, why: `Keep it to ${MAX} letters or fewer.` };
    if (/[^\p{L}\p{N}\p{M} '’.\-_]/u.test(name)) return { ok: false, why: 'Use letters, numbers, spaces and . \' - _ only.' };
    if (!/\p{L}/u.test(name)) return { ok: false, why: 'Add at least one letter.' };
    if (/\d{5,}/.test(name.replace(/[\s.\-_]/g, ''))) return { ok: false, why: 'No phone numbers or long numbers, please.' };
    if (/https?|www\.|\.(com|net|org|gg|io|ly|me|tv)\b|@/i.test(name)) return { ok: false, why: 'No links or handles, please.' };
    for (const one of ['i', 'l']) {
      const f = fold(name, one);
      if (badRe.test(letters(f))) return { ok: false, why: 'That name is not allowed. Try something kinder!' };
      for (const t of f.split(/[^\p{L}\p{N}]+/u).filter(Boolean)) if (tokRe.test(t)) return { ok: false, why: 'That name is not allowed. Try something kinder!' };
    }
    if (nativeRe.test(letters(strip(name)))) return { ok: false, why: 'That name is not allowed. Try something kinder!' };
    return { ok: true, name };
  }

  const api = { checkName, MAX_NAME: MAX };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof Meta !== 'undefined') Object.assign(Meta, api);
})();
