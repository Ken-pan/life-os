import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyLeoToCloudBundle,
  buildLeoCompactPrompt,
  buildLeoIdentityBlock,
  buildLeoImageGenGuidance,
  buildLeoLocalIdentityLines,
  buildLeoOutputContractBlock,
  formatLeoNotesForPrompt,
  isLeoConversation,
  isLeoPersona,
  leoBackstoryBrief,
  leoBackstoryCore,
  leoDailyLifeBrief,
  leoLifestyleSeed,
  leoWantsBrief,
  leoWantsSeed,
  leoHumanTextureBrief,
  leoHumanTextureSeed,
  leoPersonalityBrief,
  resolveLeoLoreNeeds,
  buildLeoLoreLines,
  LEO_DEFAULT_TTS_VOICE,
  LEO_SCENARIOS,
  LEO_VOICE_PROFILE,
  leoAntiPatterns,
  leoAutoSpeakEnabled,
  leoHandsFreeEnabled,
  leoControlDraft,
  leoControlShouldAutoSend,
  leoComposerPlaceholder,
  leoComposerQuickOpeners,
  leoExampleDialogues,
  leoFirstMessage,
  leoLocalAftercareReply,
  leoPovHardRules,
  leoReplyLooksLikeRoleSplit,
  stripLeoRoleSplitReply,
  leoReplyLooksTooChinese,
  leoSpeechStyleBrief,
  leoUserOpener,
  leoSpeakPrep,
  leoTextLooksIntimate,
  leoTtsInstruct,
  matchesLeoSafeword,
  normalizeAssistantPersona,
  normalizeLeoIntensity,
  normalizeLeoPace,
  normalizeLeoSafeword,
  normalizeLeoScenarioId,
  normalizeLeoStyle,
  normalizeLeoSceneBeat,
  formatLeoSceneBeatForPrompt,
  parseLeoSceneBeatResponse,
  parseLeoNotes,
  resolveLeoFocusInjectionMode,
  resolveSpeechPersona,
  cycleLeoIntensity,
  cycleLeoPace,
} from './leoPersona.core.js'

describe('leoPersona', () => {
  it('normalizes persona, intensity, style, scenario, pace, safeword', () => {
    assert.equal(normalizeAssistantPersona('leo'), 'leo')
    assert.equal(normalizeAssistantPersona('x'), 'korben')
    assert.equal(normalizeLeoIntensity('explicit'), 'explicit')
    assert.equal(normalizeLeoIntensity(''), 'flirty')
    assert.equal(normalizeLeoStyle('roleplay'), 'roleplay')
    assert.equal(normalizeLeoScenarioId('shower'), 'shower')
    assert.equal(normalizeLeoScenarioId('nope'), 'none')
    assert.equal(normalizeLeoPace('slow'), 'slow')
    assert.equal(normalizeLeoPace('fast'), 'fast')
    assert.equal(normalizeLeoPace(''), 'normal')
    assert.equal(normalizeLeoSafeword(''), '红灯')
    assert.equal(normalizeLeoSafeword(' 香蕉 '), '香蕉')
    assert.equal(isLeoPersona({ assistantPersona: 'leo' }), true)
    assert.equal(cycleLeoIntensity('flirty'), 'explicit')
    assert.equal(isLeoConversation({ title: 'Leo' }), true)
    assert.equal(isLeoConversation({ persona: 'leo', title: 'Miss you' }), true)
    assert.equal(isLeoConversation({ leoSceneBeat: { location: 'x' } }), true)
    assert.equal(isLeoConversation({ title: 'React debug' }), false)
  })

  it('identity is Leo adult NSFW-capable, not Korben', () => {
    const flirty = buildLeoIdentityBlock({ intensity: 'flirty' })
    assert.match(flirty, /## Role/)
    assert.match(flirty, /Leo Kuft/)
    assert.match(flirty, /不要自称 Korben/)
    assert.match(flirty, /Seattle|US adult|Americans?/i)
    assert.match(flirty, /Speech \/ Language|Primary output|native American English/i)
    assert.match(flirty, /Do NOT mirror|Chinese tags \(RARE\)|zero Chinese|English-only/i)
    assert.match(flirty, /调情|霸道|臣服|奶霸总|半笑/)
    assert.match(flirty, /不要主动背诵|内化|Lore seed|NEVER recite|internalize/i)
    assert.match(flirty, /安全词协议/)
    assert.match(flirty, /versetop/)
    // 默认轮:只挂 seed,不灌全量 lifestyle/backstory/wants
    assert.match(flirty, /Lore seed \(always\)/)
    assert.match(flirty, /Lifestyle seed \(always\)/)
    assert.match(flirty, /Wants seed \(always\)/)
    assert.match(flirty, /Human texture \(always\)/)
    assert.doesNotMatch(flirty, /## Lore · lifestyle \(activated/)
    assert.doesNotMatch(flirty, /## Lore · backstory \(activated/)
    assert.doesNotMatch(flirty, /## Lore · wants \/ drive \(activated/)
    assert.doesNotMatch(flirty, /## Lore · human texture \(activated/)
    assert.doesNotMatch(flirty, /明确 NSFW 已开启/)
    assert.doesNotMatch(flirty, /中文口语为主/)
    assert.match(leoSpeechStyleBrief(), /HARD|soft-dom|West Coast|RARE|zero Chinese/i)
    assert.match(leoBackstoryCore(), /Seattle|met at gym|A2|earbuds/)
    assert.match(leoLifestyleSeed(), /early-AM|Los_Angeles|≤1 beat|earbuds/)
    assert.match(leoBackstoryBrief(), /activated|West Coast|NEVER recite|Coffee|playlist/i)
    assert.match(leoDailyLifeBrief(), /05:30|16–20|late_night|surface ≤1|Coffee first/)
    assert.match(leoWantsSeed(), /presence|surrender|kneels/i)
    assert.match(leoWantsBrief(), /activated|Soft fears|soft-dom|Surface rule/i)
    assert.match(leoHumanTextureSeed(), /earbud|shaker|soft laugh/i)
    assert.match(leoHumanTextureBrief(), /activated|Flaws|Body beats|Demonstrate/i)
    assert.match(leoAntiPatterns(), /只抛 1 拍|奶霸总|臣服|分角色|CNC|句尾都加中文|Wait/i)
    assert.match(leoPersonalityBrief(), /Notices Ken|Flaw:|具体动词/)

    const withDay = buildLeoIdentityBlock({
      intensity: 'flirty',
      userText: '你平时一天都干什么？',
    })
    assert.match(withDay, /## Lore · lifestyle \(activated/)
    assert.match(withDay, /05:30|PT block/)
    assert.doesNotMatch(withDay, /## Lore · backstory \(activated/)

    const withWho = buildLeoIdentityBlock({
      intensity: 'flirty',
      userText: '你是谁？哪里人？',
    })
    assert.match(withWho, /## Lore · backstory \(activated/)
    assert.match(withWho, /kinesiology|committed boyfriend/)

    const withGym = buildLeoIdentityBlock({
      intensity: 'flirty',
      scenarioId: 'gym_after',
    })
    // 场景只靠「当前场景」氛围,不灌满 lifestyle 全表
    assert.doesNotMatch(withGym, /## Lore · lifestyle \(activated/)
    assert.match(withGym, /健身房|Gym|当前场景/)
    assert.match(withGym, /Dynamics seed|versetop soft-dom/)
    assert.doesNotMatch(withGym, /阴茎|粗长偏大/)

    assert.deepEqual(resolveLeoLoreNeeds('今晚想你'), {
      backstory: 'core',
      lifestyle: false,
      wants: false,
      human: false,
    })
    assert.equal(resolveLeoLoreNeeds('还没睡').lifestyle, true)
    assert.equal(resolveLeoLoreNeeds('who are you').backstory, 'full')
    assert.equal(resolveLeoLoreNeeds('tell me about yourself').backstory, 'full')
    assert.equal(resolveLeoLoreNeeds('你想要什么？').wants, true)
    assert.equal(resolveLeoLoreNeeds('你有什么怪癖？').human, true)
    assert.equal(resolveLeoLoreNeeds('humanitarian aid').human, false)
    assert.equal(
      resolveLeoLoreNeeds('', { sceneBeat: '地点:沙发;衣着:毛巾' }).lifestyle,
      false,
    )
    assert.equal(
      resolveLeoLoreNeeds('', { sceneBeat: '地点:淋浴间' }).lifestyle,
      false,
    )
    assert.match(
      buildLeoIdentityBlock({ intensity: 'flirty', userText: '你追求什么？' }),
      /## Lore · wants \/ drive \(activated/,
    )
    assert.match(
      buildLeoIdentityBlock({ intensity: 'flirty', userText: '你像真人吗？' }),
      /## Lore · human texture \(activated/,
    )
    assert.equal(
      resolveLeoLoreNeeds('', { scenarioId: 'late_night' }).lifestyle,
      false,
    )
    assert.match(
      buildLeoLoreLines({
        backstory: 'core',
        lifestyle: false,
        wants: false,
        human: false,
      }).join('\n'),
      /Lore seed|Wants seed|Human texture/,
    )
    assert.equal(
      leoReplyLooksTooChinese(
        '今天练完了？过来，我帮你拉伸一下肩膀。别装没事，刚才那组我看着呢。你额头那层汗挺好看的。',
      ),
      true,
    )
    assert.equal(
      leoReplyLooksTooChinese('Come here. Rest. I\'m here. 靠着我。'),
      false,
    )

    const explicit = buildLeoIdentityBlock({
      intensity: 'explicit',
      scenarioId: 'shower',
      style: 'roleplay',
      pace: 'slow',
      safeword: '香蕉',
      sceneBeat: '蒸汽房,Ken 背靠墙',
    })
    assert.match(explicit, /明确 NSFW|NSFW 已开/)
    assert.match(explicit, /生殖器|性行为|阴茎|舔脚|臣服/)
    assert.match(explicit, /未成年人/)
    assert.match(explicit, /推进|气声|mmh|接触/)
    assert.match(explicit, /场景 NSFW 节拍/)
    assert.match(explicit, /narrative RP|\*action|IM chat/)
    assert.match(buildLeoOutputContractBlock('explicit', 'chat', 'slow'), /节奏:慢/)
    assert.match(explicit, /香蕉/)
    assert.match(explicit, /Aftercare|抱紧/)
    assert.match(explicit, /蒸汽房,Ken 背靠墙/)
    assert.match(explicit, /粗长偏大|胀满|舔脚|CNC|pins|Kneel|奶霸总/)
    assert.match(explicit, /一致性硬规则/)
    assert.match(explicit, /POV \(HARD\)|POV \/ Turn-taking/)
    assert.match(explicit, /ONLY as Leo|NEVER write Ken/)
    assert.match(explicit, /玩味|安全词|脚抵唇/)
    assert.doesNotMatch(explicit, /Dynamics seed|No explicit anatomy/)
    assert.doesNotMatch(
      buildLeoIdentityBlock({ intensity: 'flirty' }),
      /阴茎|粗长偏大/,
    )
  })

  it('POV examples do not use Ken:/Leo: script labels; detects role-split', () => {
    const ex = leoExampleDialogues('explicit')
    assert.match(ex, /CRITICAL|Leo reply alone/)
    assert.match(ex, /User:/)
    assert.match(ex, /You:/)
    assert.doesNotMatch(ex, /^Ken:/m)
    assert.doesNotMatch(ex, /^Leo:/m)
    assert.match(leoPovHardRules(), /ONLY as Leo|one voice|POV \(HARD\)/i)
    assert.match(leoAntiPatterns(), /分角色/)
    assert.equal(
      leoReplyLooksLikeRoleSplit('Ken: 啊\nLeo: Stay.\nKen: 再深'),
      true,
    )
    assert.equal(leoReplyLooksLikeRoleSplit('*I pull you closer* Stay.'), false)
    assert.equal(
      stripLeoRoleSplitReply('Ken: 啊…\nLeo: Stay. mmh.\nKen: 再深一点'),
      'Stay. mmh.',
    )
    assert.equal(
      stripLeoRoleSplitReply('Leo: Come here. 过来。'),
      'Come here. 过来。',
    )
    assert.match(buildLeoOutputContractBlock('explicit'), /POV \(must\)/)
  })

  it('applies Leo role+output+examples+anti onto cloud bundle', () => {
    const bundle = [
      '## Role\n你是 Korben',
      '## Tools\nx',
      '## Constraints\ny',
      '## Output contract\n短答',
      '## Spaces\nz',
    ]
    const next = applyLeoToCloudBundle(bundle, {
      intensity: 'explicit',
      cloudAuthorized: true,
      writesBlocked: true,
    })
    assert.match(next[0], /Leo Kuft/)
    assert.doesNotMatch(next[0], /你是 Korben/)
    assert.match(next[0], /写权限:关闭/)
    assert.equal(next[1], '## Tools\nx')
    assert.match(next[3], /Output contract \(Leo\)/)
    assert.match(next[4], /Example dialogues/)
    assert.match(next[5], /Anti-patterns/)
  })

  it('local identity lines include appearance, contract, examples, anti', () => {
    const lines = buildLeoLocalIdentityLines({ intensity: 'flirty' })
    assert.ok(lines.length >= 4)
    assert.match(lines[0], /dark-brown|messy-wavy|Leo Kuft|Look:|freckles|earbuds/i)
    assert.match(lines[1], /Output contract \(Leo\)/)
    assert.match(lines[2], /Example dialogues/)
    assert.match(lines[3], /Anti-patterns/)
    assert.match(buildLeoOutputContractBlock('explicit', 'chat', 'fast'), /节奏:快/)
    assert.match(leoAntiPatterns(), /客服腔|纯 0|美国人设|流利|语言镜像|分角色|只抛 1 拍|奶霸总/)
    assert.match(leoAntiPatterns(), /✓|Kneel|Wait/i)
    assert.match(buildLeoOutputContractBlock('flirty'), /LANGUAGE|English/)
    assert.match(leoExampleDialogues('flirty'), /Chinese|broken|earbud|Seattle|steal you|Quads|knees|Clients early|not every sentence/i)
    assert.match(leoExampleDialogues('flirty'), /靠着我/)
    assert.match(leoExampleDialogues('explicit'), /pins your wrists|Lick|Kneel|soft laugh|夹紧/i)
    assert.match(buildLeoOutputContractBlock('flirty'), /RARE|English-only|Chinese tags/i)
    assert.match(leoLocalAftercareReply({}), /Okay\. We stop|I've got you|抱着你/)
    assert.match(leoLocalAftercareReply({ locale: 'en' }), /We stop|got you/)
    for (const sc of LEO_SCENARIOS) {
      assert.equal(leoReplyLooksTooChinese(sc.firstMes.flirty), false, sc.id)
      assert.equal(leoReplyLooksTooChinese(sc.firstMes.explicit), false, sc.id)
      assert.equal(leoReplyLooksTooChinese(sc.firstMesAlt.flirty), false, sc.id)
      assert.equal(leoReplyLooksTooChinese(sc.firstMesAlt.explicit), false, sc.id)
    }
  })

  it('image gen guidance locks leo_kuft face/body', () => {
    const g = buildLeoImageGenGuidance({
      sceneBeat: '地点:淋浴间\n衣着:仅毛巾',
    })
    assert.match(g, /generate_image/)
    assert.match(g, /leo_kuft/)
    assert.match(g, /禁止换脸/)
    assert.match(g, /list_characters/)
    assert.match(g, /quality="quality"/)
    assert.match(g, /dark-brown messy-wavy|lean-strong athlete|freckles|earbuds/i)
    assert.match(g, /不要:每条文字回复都自动生图/)
    assert.match(g, /瞬间/)
    assert.match(g, /淋浴间/)
  })

  it('firstMes is Leo POV; userOpener is Ken POV; alternates', () => {
    const shower = LEO_SCENARIOS.find((s) => s.id === 'shower')
    assert.ok(shower)
    const a = leoFirstMessage({
      leoIntensity: 'explicit',
      leoScenario: 'shower',
    })
    const b = leoFirstMessage({
      leoIntensity: 'explicit',
      leoScenario: 'shower',
    })
    const allowed = new Set([
      shower.firstMes.explicit,
      shower.firstMesAlt.explicit,
    ])
    assert.ok(allowed.has(a), `unexpected firstMes: ${a}`)
    assert.ok(allowed.has(b), `unexpected firstMes: ${b}`)
    assert.notEqual(a, b)
    const opener = leoUserOpener({
      leoIntensity: 'explicit',
      leoScenario: 'shower',
    })
    // 默认英文化 Ken→Leo opener
    assert.equal(
      opener,
      shower.userOpenerEn?.explicit || shower.userOpener.explicit,
    )
    assert.doesNotMatch(opener, /蒸汽里看不清脸/)
    assert.match(opener, /Water|I'm in|进来|水开着/i)
  })

  it('control drafts are Ken→Leo; stop uses safeword; autosend flags', () => {
    // 无上一句 Leo 正文时默认英文化(跟 Speech / Language 对齐)
    assert.equal(leoControlDraft('slow'), 'Slow down.')
    assert.equal(leoControlDraft('continue'), 'Keep going.')
    assert.equal(leoControlDraft('aftercare'), 'Hold me for a bit. No rush.')
    assert.equal(leoControlDraft('submit'), 'Tonight I follow your lead.')
    assert.equal(leoControlDraft('meaner'), 'Be meaner. Tell me what to do.')
    assert.equal(
      leoComposerQuickOpeners({ leoIntensity: 'flirty' }).find((o) => o.id === 'submit')
        ?.text,
      'Tonight I follow your lead.',
    )
    assert.equal(
      leoComposerQuickOpeners({ leoIntensity: 'flirty' }, {
        lastLeoText:
          '今天练完了？过来，我帮你拉伸一下肩膀。别装没事，刚才那组我看着呢。你额头那层汗挺好看的。再喝口水休息。',
      }).find((o) => o.id === 'submit')?.text,
      '今晚听你的。想被你带着。',
    )
    assert.equal(
      leoControlDraft('slow', {}, { lastLeoText: '过来靠着我休息吧亲爱的你今天太累了真的' }),
      '慢一点。',
    )
    assert.equal(leoControlDraft('stop', { leoSafeword: '香蕉' }), '香蕉')
    assert.equal(leoControlDraft('stop', {}), '红灯')
    assert.equal(leoControlShouldAutoSend('continue'), true)
    assert.equal(leoControlShouldAutoSend('stop'), true)
    assert.equal(leoControlShouldAutoSend('aftercare'), true)
    assert.equal(leoControlShouldAutoSend('submit'), false)
    assert.equal(cycleLeoPace('slow'), 'normal')
    assert.equal(cycleLeoPace('fast'), 'slow')
    assert.match(
      leoComposerPlaceholder({
        leoScenario: 'shower',
        leoHandsFree: false,
        locale: 'zh',
      }, { lastLeoText: '过来靠着我休息吧亲爱的你今天太累了真的需要好好放松一下肩膀' }),
      /蒸汽|steam/i,
    )
    assert.ok(leoComposerQuickOpeners({ leoIntensity: 'explicit' }).length >= 2)
  })

  it('safeword hard-stop match + local aftercare + autoSpeak gate', () => {
    assert.equal(matchesLeoSafeword('红灯', {}), true)
    assert.equal(matchesLeoSafeword('停', {}), true)
    assert.equal(matchesLeoSafeword('香蕉', { leoSafeword: '香蕉' }), true)
    assert.equal(matchesLeoSafeword('红灯。', {}), true)
    // 恐慌连打同一安全词仍算硬停
    assert.equal(matchesLeoSafeword('红灯红灯红灯', {}), true)
    assert.equal(matchesLeoSafeword('stop stop stop', {}), true)
    assert.equal(matchesLeoSafeword('红灯，红灯！', {}), true)
    assert.equal(matchesLeoSafeword('香蕉 香蕉', { leoSafeword: '香蕉' }), true)
    assert.equal(matchesLeoSafeword('我想说红灯但还没', {}), false)
    assert.equal(matchesLeoSafeword('红灯是什么意思', {}), false)
    assert.equal(matchesLeoSafeword('继续', {}), false)
    assert.match(leoLocalAftercareReply({}), /stop|got you|抱着你/i)
    assert.match(leoLocalAftercareReply({ locale: 'zh' }), /抱着你/)
    assert.match(leoLocalAftercareReply({ locale: 'en' }), /stop/i)
    assert.equal(leoLocalAftercareReply({ locale: 'en' }).includes('抱着你'), false)
    assert.equal(leoAutoSpeakEnabled({}), true)
    assert.equal(leoAutoSpeakEnabled({ leoAutoSpeak: true }), true)
    assert.equal(leoAutoSpeakEnabled({ leoAutoSpeak: false }), false)
    assert.equal(leoHandsFreeEnabled({}), true)
    assert.equal(leoHandsFreeEnabled({ leoHandsFree: false }), false)
    assert.match(
      leoComposerPlaceholder({ leoHandsFree: true }),
      /Talk to Leo|跟 Leo|pause|停顿/i,
    )
    assert.match(
      leoUserOpener({ leoScenario: 'late_night', leoIntensity: 'flirty' }),
      /Still up|Miss you/i,
    )
    assert.match(
      leoUserOpener(
        { leoScenario: 'late_night', leoIntensity: 'flirty', locale: 'zh' },
        {
          lastLeoText:
            '今天练完了？过来，我帮你拉伸一下肩膀。别装没事，刚才那组我看着呢。你额头那层汗挺好看的。',
        },
      ),
      /还没睡|想你/,
    )
  })

  it('normalizes and formats scene beat; parses tinyComplete JSON', () => {
    assert.equal(normalizeLeoSceneBeat(null), null)
    assert.equal(normalizeLeoSceneBeat({ location: '', clothing: '' }), null)
    const beat = normalizeLeoSceneBeat({
      location: '蒸汽房',
      clothing: '毛巾半敞',
      contact: '胸口贴近',
      aftercare: '',
    })
    assert.equal(beat?.location, '蒸汽房')
    assert.match(formatLeoSceneBeatForPrompt(beat), /地点:蒸汽房/)
    assert.match(formatLeoSceneBeatForPrompt(beat), /衣着:毛巾半敞/)
    const parsed = parseLeoSceneBeatResponse(
      '杂讯\n{"location":"沙发","clothing":"T恤","contact":"腿叠着","aftercare":"抱着"}\n尾',
    )
    assert.equal(parsed?.location, '沙发')
    assert.equal(parsed?.aftercare, '抱着')
    assert.equal(parseLeoSceneBeatResponse('not json'), null)
  })

  it('parses structured notes; free text still works', () => {
    const structured = parseLeoNotes(
      '喜欢: 被夸奖\n雷点: 公开场合\n称呼: 肯儿',
    )
    assert.equal(structured.structured, true)
    assert.equal(structured.likes, '被夸奖')
    assert.equal(structured.limits, '公开场合')
    assert.equal(structured.nicknames, '肯儿')
    const prompt = formatLeoNotesForPrompt(
      '喜欢: 被夸奖\n雷点: 公开场合\n称呼: 肯儿',
    )
    assert.match(prompt, /雷点\(硬边界/)
    assert.match(prompt, /肯儿/)
    const free = formatLeoNotesForPrompt('喜欢被夸奖肩背')
    assert.equal(free, '喜欢被夸奖肩背')
  })

  it('focus injection skips during intimate turns', () => {
    assert.equal(resolveLeoFocusInjectionMode('继续，别停'), 'skip')
    assert.equal(resolveLeoFocusInjectionMode('帮我看今天待办'), 'full')
    assert.equal(
      resolveLeoFocusInjectionMode('focus 里那个审批'),
      'full',
    )
    assert.equal(resolveLeoFocusInjectionMode('今晚想你'), 'soft')
  })

  it('compact prompt keeps scene continuity fields', () => {
    const p = buildLeoCompactPrompt('旧摘要', 'Ken: 慢一点\nLeo: 好')
    assert.match(p, /身体\/动作进度/)
    assert.match(p, /aftercare/)
    assert.match(p, /Ken:\/Leo:/)
    assert.match(p, /英文为主/)
    assert.match(p, /旧摘要/)
  })

  it('speech persona forces Leo clone + breathy NSFW TTS prep', () => {
    const speech = resolveSpeechPersona({
      assistantPersona: 'leo',
      leoIntensity: 'explicit',
      leoStyle: 'roleplay',
      ttsVoice: 'ryan',
    })
    assert.equal(speech.persona, 'leo')
    assert.equal(speech.voice, 'leo')
    assert.equal(speech.resolveRate(1), 0.92)
    assert.equal(speech.resolveRate(1.25), 1.25)
    assert.match(
      speech.instructFor('Easy… mmh'),
      /early-20s|Leo|youthful midrange|breath|moan|Close-mic|ellipses|Never deep/i,
    )
    assert.doesNotMatch(
      speech.instructFor('Easy… mmh'),
      /Low warm chest|baritone uncle/i,
    )
    assert.match(
      leoTtsInstruct('hello', 'flirty'),
      /early-20s|Leo|bright midrange|sunny and sexy|playful/i,
    )
    assert.equal(leoTextLooksIntimate('Easy… mmh. Take it.'), true)
    assert.equal(leoTextLooksIntimate('Squats tomorrow.'), false)
    assert.match(
      leoSpeakPrep('*掌心压住你的腰* 别躲。'),
      /掌心压住你的腰.*别躲/,
    )
    const breathy = leoSpeakPrep(
      '*soft moan against your neck* Easy — yeah. mmh. Take it.',
      { intensity: 'explicit' },
    )
    assert.match(breathy, /soft moan/i)
    assert.match(breathy, /…/)
    assert.match(breathy, /mmh…/i)
    assert.equal(LEO_DEFAULT_TTS_VOICE, 'leo')
    assert.equal(LEO_VOICE_PROFILE.local, 'leo')
    assert.equal(LEO_VOICE_PROFILE.community.minimaxCn, 'junlang_nanyou')

    const korben = resolveSpeechPersona({
      assistantPersona: 'korben',
      ttsVoice: 'dylan',
    })
    assert.equal(korben.voice, 'dylan')
    assert.equal(korben.instructFor('hi'), undefined)
  })

  it('injects relationship notes when provided', () => {
    const block = buildLeoIdentityBlock({
      intensity: 'explicit',
      notes: '喜欢被夸奖肩背',
    })
    assert.match(block, /关系笔记/)
    assert.match(block, /喜欢被夸奖肩背/)
  })
})
