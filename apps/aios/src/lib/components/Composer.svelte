<script>
  import Icon from '@life-os/platform-web/svelte/icon'
  import { sensory } from '@life-os/platform-web/kenos-sensory'
  import { createImeGuard } from '@life-os/theme'
  import { t } from '$lib/i18n/index.js'
  import {
    C,
    sendMessage,
    shareLeoStill,
    stopStreaming,
    getDraft,
    setDraft,
    requestEditLastUser,
    requestLeoListen,
    cancelLeoListen,
  } from '$lib/chat.svelte.js'
  import {
    transcribe,
    polishTranscript,
    unlockSpeechAudio,
    stopActiveSpeech,
  } from '$lib/localai.js'
  import { importFile, IMPORT_ACCEPT } from '$lib/fileImport.js'
  import { S, save } from '$lib/state.svelte.js'
  import {
    LEO_SCENARIOS,
    cycleLeoIntensity,
    cycleLeoPace,
    isLeoPersona,
    leoComposerPlaceholder,
    leoComposerPreferEnglish,
    leoComposerQuickOpeners,
    leoControlDraft,
    leoControlShouldAutoSend,
    leoHandsFreeEnabled,
    leoUserOpener,
    normalizeLeoIntensity,
    normalizeLeoPace,
    normalizeLeoScenarioId,
    normalizeLeoStyle,
  } from '$lib/kenos/leoPersona.core.js'
  import {
    LEO_VOICE,
    createVoiceEndDetector,
    leoAsrPromptHint,
    leoMicConstraints,
    prepareLeoVoiceTranscript,
    voiceRmsFromTimeDomain,
  } from '$lib/kenos/leoVoice.core.js'
  import { leoImageDraft, looksLikeLeoImageAsk } from '$lib/kenos/leoAvatar.core.js'
  import {
    leoStillChipHint,
    leoStillPickerGroups,
    resolveLeoStill,
  } from '$lib/kenos/leoStills.core.js'
  import { setLeoPetListening } from '$lib/kenos/leoPet.svelte.js'

  /** @type {{
   *   autofocus?: boolean
   *   placeholder?: string
   *   contextLabel?: string
   *   contextMeta?: string
   *   onClearContext?: (() => void) | undefined
   *   leoOpeners?: boolean
   * }} */
  let {
    autofocus = false,
    placeholder = undefined,
    contextLabel = undefined,
    contextMeta = undefined,
    onClearContext = undefined,
    leoOpeners = true,
  } = $props()

  const leoOn = $derived(isLeoPersona(S.settings))
  const leoHandsFree = $derived(leoOn && leoHandsFreeEnabled(S.settings))
  const leoIntensity = $derived(normalizeLeoIntensity(S.settings.leoIntensity))
  const leoStyle = $derived(normalizeLeoStyle(S.settings.leoStyle))
  const leoPace = $derived(normalizeLeoPace(S.settings.leoPace))
  const leoScenarioId = $derived(normalizeLeoScenarioId(S.settings.leoScenario))
  /** 最近一条 Leo 回复 — 决定草稿/开场用英还是中 */
  const lastLeoText = $derived.by(() => {
    const conv = C.conversations.find((c) => c.id === C.activeId)
    if (!conv?.messages?.length) return ''
    for (let i = conv.messages.length - 1; i >= 0; i--) {
      const m = conv.messages[i]
      if (m?.role === 'assistant' && m.content && !m.error) return m.content
    }
    return ''
  })
  const leoDraftOpts = $derived({ lastLeoText })
  const leoDraftEn = $derived(leoComposerPreferEnglish(S.settings, lastLeoText))
  const leoChipLabel = $derived(
    leoOn
      ? leoIntensity === 'explicit'
        ? t('chat.leoModeExplicit')
        : t('chat.leoModeFlirty')
      : '',
  )
  const leoPaceChipLabel = $derived(
    leoPace === 'slow'
      ? t('chat.leoPaceChipSlow')
      : leoPace === 'fast'
        ? t('chat.leoPaceChipFast')
        : t('chat.leoPaceChipNormal'),
  )
  const leoScenarioChips = $derived(
    LEO_SCENARIOS.filter((s) => s.id !== 'none'),
  )
  const leoQuickOpeners = $derived(
    leoComposerQuickOpeners(S.settings, leoDraftOpts),
  )
  /** 更多面板默认收起,保证输入框始终在视口内(行业:主路径极简) */
  let leoPanelOpen = $state(false)
  const leoOpenerPreview = $derived(leoQuickOpeners.slice(0, 2))
  /** 本机生图才可用;云端 Kimi / 网关不通 / tools 关时禁用 */
  const leoImageDisabled = $derived(
    C.chatBackend === 'kimi' ||
      C.gatewayOk === false ||
      S.settings.tools === false,
  )

  const resolvedPlaceholder = $derived(
    recording
      ? t('chat.listening')
      : transcribing
        ? t('chat.transcribing')
        : leoOn
          ? leoComposerPlaceholder(S.settings, leoDraftOpts)
          : placeholder || t('chat.placeholder'),
  )

  function cycleLeoChip() {
    void unlockSpeechAudio()
    S.settings.leoIntensity = cycleLeoIntensity(S.settings.leoIntensity)
    save()
  }

  function cycleLeoPaceChip() {
    void unlockSpeechAudio()
    S.settings.leoPace = cycleLeoPace(S.settings.leoPace)
    save()
  }

  function setLeoScenario(id) {
    void unlockSpeechAudio()
    const next = normalizeLeoScenarioId(id)
    // 再点同一场景 = 取消
    const cleared =
      S.settings.leoScenario === next && next !== 'none' ? 'none' : next
    S.settings.leoScenario = cleared
    save()
    // 输入框空时:填「你→Leo」的开场句(用户视角),不要填 Leo 的台词
    if (!text.trim() && cleared !== 'none') {
      text = leoUserOpener(
        {
          leoScenario: cleared,
          leoIntensity: S.settings.leoIntensity,
          locale: S.settings.locale,
        },
        { lastLeoText },
      )
      requestAnimationFrame(autogrow)
      textarea?.focus()
    }
  }

  function toggleLeoStyle() {
    void unlockSpeechAudio()
    S.settings.leoStyle =
      normalizeLeoStyle(S.settings.leoStyle) === 'roleplay' ? 'chat' : 'roleplay'
    save()
  }

  function toggleLeoHandsFree() {
    void unlockSpeechAudio()
    const next = S.settings.leoHandsFree === false
    S.settings.leoHandsFree = next
    save()
    if (!next) {
      cancelLeoListen()
      if (recording) recorder?.stop()
    }
  }

  /** @param {string} draft */
  function fillComposerDraft(draft) {
    if (!draft) return
    text = draft
    requestAnimationFrame(autogrow)
    textarea?.focus()
  }

  /**
   * 交通灯一键发送;开场/口吻类只填入。
   * 流式中仅「停」可打断并直发(安全词硬停)。
   * @param {'slow'|'continue'|'stop'|'aftercare'|'submit'|'meaner'|'ooc'} kind
   */
  async function applyLeoControl(kind) {
    if (C.streaming) {
      if (kind !== 'stop') return
      stopStreaming()
    }
    void unlockSpeechAudio()
    const draft = leoControlDraft(kind, S.settings, { lastLeoText })
    if (!draft) return
    if (!leoControlShouldAutoSend(kind)) {
      // OOC:若已有正文则前缀,否则填入
      if (kind === 'ooc' && text.trim() && !/^\(OOC\)/i.test(text)) {
        text = `(OOC) ${text.trim()}`
      } else {
        fillComposerDraft(draft)
      }
      return
    }
    text = ''
    setDraft(C.activeId, '')
    requestAnimationFrame(autogrow)
    void sensory('soft')
    await sendMessage(draft)
  }

  function applyLeoOpener(openerText) {
    void unlockSpeechAudio()
    fillComposerDraft(openerText)
  }

  /**
   * 业界「生成一张」:空框一键直发;已有正文则追加出图指令后直发。
   * 不后台狂刷——只在用户点芯片时触发。
   */
  async function applyLeoImageDraft() {
    if (leoImageDisabled || C.streaming) return
    void unlockSpeechAudio()
    const locale = leoDraftEn || S.settings.locale === 'en' ? 'en' : 'zh'
    const trimmed = text.trim()
    const hasDraft = Boolean(trimmed)
    // 已含出图意图时不再叠句,直接发
    const payload =
      hasDraft && looksLikeLeoImageAsk(trimmed)
        ? trimmed
        : hasDraft
          ? `${trimmed}${leoImageDraft({ locale, hasDraft: true })}`
          : leoImageDraft({ locale, hasDraft: false })
    text = ''
    setDraft(C.activeId, '')
    requestAnimationFrame(autogrow)
    void sensory('soft')
    await sendMessage(payload)
  }

  /**
   * 「瞬间」:贴现成角色照（秒出）。短按打开 moment picker；长按/再点已开则默认解析。
   * 行业：Replika / CAI 选图发瞬间，而不是每次等生图。
   */
  let leoStillPickerOpen = $state(false)
  const leoStillGroups = $derived(
    leoStillPickerGroups({
      locale: leoDraftEn || S.settings.locale === 'en' ? 'en' : 'zh',
      scenarioId: leoScenarioId,
    }),
  )

  function toggleLeoStillPicker() {
    if (C.streaming) return
    void unlockSpeechAudio()
    leoStillPickerOpen = !leoStillPickerOpen
  }

  /** @param {string} stillId */
  function applyLeoStillId(stillId) {
    if (C.streaming) return
    void unlockSpeechAudio()
    leoStillPickerOpen = false
    void sensory('soft')
    shareLeoStill({
      stillId,
      scenarioId: leoScenarioId,
      text: text.trim(),
    })
  }

  function applyLeoStillQuick() {
    if (C.streaming) return
    const still = resolveLeoStill({
      scenarioId: leoScenarioId,
      text: text.trim(),
    })
    applyLeoStillId(still.id)
  }

  const leoStillHint = $derived(
    leoStillChipHint({
      locale: leoDraftEn || S.settings.locale === 'en' ? 'en' : 'zh',
    }),
  )
  /** 已有用户发言后不再刷开场 chip（空态首页另有一套） */
  const leoConversationHasUser = $derived.by(() => {
    const conv = C.conversations.find((c) => c.id === C.activeId)
    return Boolean(conv?.messages?.some((m) => m?.role === 'user'))
  })
  const showLeoOpeners = $derived(
    leoOn &&
      leoOpeners &&
      !leoConversationHasUser &&
      !text.trim() &&
      !C.streaming &&
      !leoPanelOpen &&
      !leoStillPickerOpen,
  )

  const ime = createImeGuard()

  let text = $state(getDraft(C.activeId))
  let images = $state([])
  let files = $state([])
  let importing = $state(0) // 正在解析中的文件数
  let textarea = $state(null)
  let fileInput = $state(null)
  let recording = $state(false)
  let transcribing = $state(false)

  $effect(() => {
    setLeoPetListening(Boolean(recording || transcribing))
  })
  let recorder = null
  /** @type {(() => void) | null} */
  let stopSilenceWatch = null
  let lastLeoListenSignal = 0
  /** @type {ReturnType<typeof setTimeout> | null} */
  let voiceHintTimer = null
  let voiceHint = $state('')
  let menuOpen = $state(false)
  let menuEl = $state(null)
  let menuBtn = $state(null)
  let dragging = $state(false)
  let dragDepth = 0
  let lastActiveId = C.activeId

  /* —— 「+」能力菜单:让附件/生图/搜索等能力显性可发现(ChatGPT 式) —— */
  const menuItems = $derived([
    {
      key: 'files',
      icon: 'paperclip',
      title: t('chat.menuAttach'),
      desc: t('chat.menuAttachDesc'),
    },
    {
      key: 'image',
      icon: 'image',
      title: t('chat.menuImage'),
      desc: t('chat.menuImageDesc'),
      prefix: t('chat.menuImagePrefix'),
    },
    {
      key: 'search',
      icon: 'search',
      title: t('chat.menuSearch'),
      desc: t('chat.menuSearchDesc'),
      prefix: t('chat.menuSearchPrefix'),
    },
    {
      key: 'notes',
      icon: 'notebook',
      title: t('chat.menuNotes'),
      desc: t('chat.menuNotesDesc'),
      prefix: t('chat.menuNotesPrefix'),
    },
  ])

  function menuAction(item) {
    menuOpen = false
    if (item.key === 'files') {
      fileInput?.click()
      return
    }
    // 预填模板前缀(输入框已有内容时不覆盖,只聚焦)
    if (item.prefix && !text.trim()) {
      text = item.prefix
      requestAnimationFrame(autogrow)
    }
    textarea?.focus()
  }

  // 点外关闭 + Escape 关闭
  $effect(() => {
    if (!menuOpen) return
    const onDocClick = (e) => {
      if (!menuEl?.contains(e.target) && !menuBtn?.contains(e.target))
        menuOpen = false
    }
    const onDocKey = (e) => {
      if (e.key === 'Escape') {
        menuOpen = false
        menuBtn?.focus()
      }
    }
    document.addEventListener('pointerdown', onDocClick, true)
    document.addEventListener('keydown', onDocKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDocClick, true)
      document.removeEventListener('keydown', onDocKey, true)
    }
  })

  const canSend = $derived(
    (text.trim().length > 0 || images.length > 0 || files.length > 0) &&
      !C.streaming &&
      importing === 0,
  )

  function autogrow() {
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
  }

  function onInput() {
    autogrow()
    setDraft(C.activeId, text) // 每会话草稿留存(内部去抖)
  }

  // 切换会话:把当前正在打的字存回旧会话,载入新会话的草稿
  $effect(() => {
    const id = C.activeId
    if (id === lastActiveId) return
    setDraft(lastActiveId, text)
    text = getDraft(id)
    lastActiveId = id
    requestAnimationFrame(autogrow)
  })

  /* —— 整页拖拽上传:拖文件到页面任意处即可添加(对齐 GPT/Claude)——
     只有一个 Composer 实例在场(空态 hero 或底部 dock),故 document 级监听即"全页" */
  $effect(() => {
    const isFileDrag = (e) =>
      [...(e.dataTransfer?.types ?? [])].includes('Files')
    const onEnter = (e) => {
      if (!isFileDrag(e)) return
      e.preventDefault()
      dragDepth++
      dragging = true
    }
    const onOver = (e) => {
      if (isFileDrag(e)) e.preventDefault() // 必须阻止默认才允许 drop
    }
    const onLeave = (e) => {
      if (!isFileDrag(e)) return
      dragDepth = Math.max(0, dragDepth - 1)
      if (dragDepth === 0) dragging = false
    }
    const onDrop = async (e) => {
      if (!isFileDrag(e)) return
      e.preventDefault()
      dragDepth = 0
      dragging = false
      for (const file of e.dataTransfer?.files ?? []) await addAnyFile(file)
      textarea?.focus()
    }
    document.addEventListener('dragenter', onEnter)
    document.addEventListener('dragover', onOver)
    document.addEventListener('dragleave', onLeave)
    document.addEventListener('drop', onDrop)
    return () => {
      document.removeEventListener('dragenter', onEnter)
      document.removeEventListener('dragover', onOver)
      document.removeEventListener('dragleave', onLeave)
      document.removeEventListener('drop', onDrop)
    }
  })

  async function submit() {
    if (ime.isComposing()) return
    if (C.streaming) {
      stopStreaming()
      return
    }
    if (!text.trim() && !images.length && !files.length) return
    // Leo:在发送手势内解锁音频,流式结束后才能自动朗读
    if (leoOn) void unlockSpeechAudio()
    const value = text
    const attachedImages = images
    const attachedFiles = files
    text = ''
    images = []
    files = []
    setDraft(C.activeId, '') // 发送即清掉该会话草稿
    requestAnimationFrame(autogrow)
    void sensory('soft')
    await sendMessage(value, attachedImages, attachedFiles)
  }

  function onKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      // Let IME confirm candidates; do not preventDefault while composing.
      if (ime.isComposing(event)) return
      event.preventDefault()
      submit()
      return
    }
    // 空输入框按 ↑:编辑上一条用户消息(ChatGPT 式快捷)
    if (
      event.key === 'ArrowUp' &&
      !text.trim() &&
      !images.length &&
      !files.length &&
      !ime.isComposing(event) &&
      requestEditLastUser()
    ) {
      event.preventDefault()
    }
  }

  /* —— 附件:图片降采样;文本文件读入内容(供模型阅读 + 侧栏查看)—— */
  async function addImageFile(file) {
    if (images.length >= 4) return
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 1568 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    images = [...images, canvas.toDataURL('image/jpeg', 0.88)]
  }

  async function addAnyFile(file) {
    if (file.type.startsWith('image/')) return addImageFile(file)
    if (files.length >= 4 || file.size > 50 * 1024 * 1024) return
    importing++
    try {
      const imported = await importFile(file)
      if (!imported) return
      // 扫描版 PDF:抽不到文本 → 页面图并入图片附件走视觉模型
      if (imported.pageImages?.length) {
        images = [...images, ...imported.pageImages].slice(0, 4)
        imported.pageImages = undefined
        imported.text =
          '(扫描版 PDF,无文本层;页面已作为图片附上,请直接阅读图片。)'
      }
      files = [...files, imported]
    } catch (err) {
      files = [
        ...files,
        {
          name: file.name,
          size: file.size,
          text: `(解析失败:${err?.message ?? err})`,
          kind: 'text',
        },
      ]
    } finally {
      importing--
    }
  }

  async function onFilesPicked(event) {
    for (const file of event.target.files ?? []) await addAnyFile(file)
    event.target.value = ''
  }

  async function onPaste(event) {
    const pasted = [...(event.clipboardData?.items ?? [])]
      .filter((i) => i.kind === 'file')
      .map((i) => i.getAsFile())
      .filter(Boolean)
    if (pasted.length) {
      event.preventDefault()
      for (const file of pasted) await addAnyFile(file)
    }
  }

  function removeImage(index) {
    images = images.filter((_, i) => i !== index)
  }

  function removeFile(index) {
    files = files.filter((_, i) => i !== index)
  }

  /* —— 语音输入:MediaRecorder → 本地 Qwen3-ASR ——
     Leo 对讲:VAD 说完即发 + barge-in + 可取消续听 —— */
  /** @type {ReturnType<typeof setTimeout> | null} */
  let maxRecordTimer = null

  function clearMaxRecordTimer() {
    if (maxRecordTimer) {
      clearTimeout(maxRecordTimer)
      maxRecordTimer = null
    }
  }

  /**
   * @param {MediaStream} stream
   * @param {() => void} onSilence
   */
  function attachSilenceWatch(stream, onSilence) {
    /** @type {AudioContext | null} */
    let ctx = null
    let alive = true
    const startedAt = performance.now()
    const detector = createVoiceEndDetector()
    const tickMs = 100
    try {
      ctx = new AudioContext()
      const src = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      src.connect(analyser)
      const data = new Uint8Array(analyser.fftSize)
      const tick = () => {
        if (!alive || !recording) return
        analyser.getByteTimeDomainData(data)
        const rms = voiceRmsFromTimeDomain(data)
        const elapsed = performance.now() - startedAt
        if (detector.push(rms, elapsed) === 'end') {
          onSilence()
          return
        }
        setTimeout(tick, tickMs)
      }
      setTimeout(tick, tickMs)
    } catch {
      /* 无 AudioContext 时仅手动停 / 超时停 */
    }
    return () => {
      alive = false
      try {
        void ctx?.close()
      } catch {
        /* ignore */
      }
    }
  }

  function scheduleRetryListen() {
    if (!leoHandsFreeEnabled(S.settings) || !isLeoPersona(S.settings)) return
    requestLeoListen(LEO_VOICE.retryListenMs)
  }

  /** @param {string} msg */
  function flashVoiceHint(msg) {
    if (voiceHintTimer) clearTimeout(voiceHintTimer)
    voiceHint = msg
    voiceHintTimer = setTimeout(() => {
      voiceHint = ''
      voiceHintTimer = null
    }, 1600)
  }

  async function startRecording() {
    if (recording || transcribing) return
    // barge-in:打断生成与朗读
    if (C.streaming) stopStreaming()
    cancelLeoListen()
    stopActiveSpeech({ silent: true })
    voiceHint = ''
    try {
      void unlockSpeechAudio()
      const stream = await navigator.mediaDevices.getUserMedia(
        leoMicConstraints(),
      )
      const chunks = []
      const handsFreeShot = leoHandsFree
      recorder = new MediaRecorder(stream)
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
      recorder.onstop = async () => {
        clearMaxRecordTimer()
        stopSilenceWatch?.()
        stopSilenceWatch = null
        stream.getTracks().forEach((track) => track.stop())
        recording = false
        const mime = recorder?.mimeType || 'audio/webm'
        const blob = new Blob(chunks, { type: mime })
        recorder = null
        if (blob.size < LEO_VOICE.minBlobBytes) {
          if (handsFreeShot) {
            flashVoiceHint(t('chat.leoVoiceTooShort'))
            scheduleRetryListen()
          }
          return
        }
        transcribing = true
        try {
          const leoMode = handsFreeShot || isLeoPersona(S.settings)
          const asr = await polishTranscript(
            await transcribe(blob, {
              prompt: leoMode ? leoAsrPromptHint() : undefined,
            }),
          )
          const prepared = prepareLeoVoiceTranscript(asr, {
            leoMode,
            handsFree: handsFreeShot,
          })
          if (!prepared.ok) {
            if (handsFreeShot) {
              if (prepared.reason === 'wake') {
                flashVoiceHint(t('chat.leoVoiceHeardName'))
              } else {
                flashVoiceHint(t('chat.leoVoiceUnclear'))
              }
              scheduleRetryListen()
            }
            return
          }
          const raw = prepared.text
          if (handsFreeShot && isLeoPersona(S.settings)) {
            text = ''
            setDraft(C.activeId, '')
            requestAnimationFrame(autogrow)
            void sensory('soft')
            await sendMessage(raw)
            return
          }
          text = text ? `${text} ${raw}` : raw
          requestAnimationFrame(autogrow)
          textarea?.focus()
        } catch {
          if (handsFreeShot) {
            flashVoiceHint(t('chat.leoVoiceUnclear'))
            scheduleRetryListen()
          }
        } finally {
          transcribing = false
        }
      }
      recorder.start(250)
      recording = true
      if (handsFreeShot) {
        stopSilenceWatch = attachSilenceWatch(stream, () => {
          if (recording) recorder?.stop()
        })
        clearMaxRecordTimer()
        maxRecordTimer = setTimeout(() => {
          if (recording) recorder?.stop()
        }, LEO_VOICE.maxRecordMs)
      }
    } catch {
      recording = false
      clearMaxRecordTimer()
      stopSilenceWatch?.()
      stopSilenceWatch = null
      flashVoiceHint(t('chat.leoVoiceMicDenied'))
    }
  }

  async function toggleRecording() {
    if (recording) {
      recorder?.stop()
      return
    }
    await startRecording()
  }

  $effect(() => {
    if (autofocus) textarea?.focus()
  })

  /* Leo 朗读结束后自动开麦 */
  $effect(() => {
    const sig = C.leoListenSignal
    if (!sig || sig === lastLeoListenSignal) return
    lastLeoListenSignal = sig
    if (!leoHandsFree || C.streaming || recording || transcribing) return
    queueMicrotask(() => {
      void startRecording()
    })
  })

  /* 退出 Leo / 关掉对讲:立刻停麦并取消续听（只在从开→关时跑，避免每次挂载写 state） */
  let prevLeoHandsFree = $state(false)
  $effect(() => {
    const on = leoHandsFree
    const wasOn = prevLeoHandsFree
    prevLeoHandsFree = on
    if (on || !wasOn) return
    cancelLeoListen()
    if (recording) recorder?.stop()
  })
</script>

<div class="composer" class:recording class:leo-handsfree={leoHandsFree}>
    {#if leoHandsFree && (recording || transcribing || voiceHint)}
      <div class="leo-voice-status" aria-live="polite" data-testid="leo-voice-status">
        <span class="leo-voice-dot" class:active={recording}></span>
        <span class="leo-voice-status-text">
          {#if recording}
            {t('chat.leoListening')}
          {:else if transcribing}
            {t('chat.transcribing')}
          {:else}
            {voiceHint}
          {/if}
        </span>
      </div>
    {/if}
    {#if leoOn}
      <!-- 主路径单行:尺度 + 对讲 + 停 + 更多。其余(风格/节奏/场景/瞬间/出图/
           aftercare/submit/meaner/OOC/设置)收进「更多」面板分组,避免常驻
           两行挤掉输入框 -->
      <div class="context-row" data-testid="composer-context-row">
        <button
          type="button"
          class="context-chip leo-chip"
          class:leo-chip-explicit={leoIntensity === 'explicit'}
          title={t('chat.leoModeCycleHint')}
          aria-label={t('chat.leoModeCycleHint')}
          onclick={cycleLeoChip}
        >
          <span class="context-chip-label">{leoChipLabel}</span>
        </button>
        <button
          type="button"
          class="context-chip"
          class:leo-chip-on={leoHandsFree}
          title={t('chat.leoHandsFreeHint')}
          aria-pressed={leoHandsFree}
          aria-label={t('chat.leoHandsFreeHint')}
          onclick={toggleLeoHandsFree}
        >
          <span class="context-chip-label">{t('chat.leoHandsFree')}</span>
        </button>
        <button
          type="button"
          class="context-chip leo-control-stop"
          title={t('chat.leoFlowHint')}
          aria-label={t('chat.leoControlStop')}
          onclick={() => applyLeoControl('stop')}
        >
          <span class="context-chip-label">{t('chat.leoControlStop')}</span>
        </button>
        <button
          type="button"
          class="context-chip"
          class:leo-chip-on={leoPanelOpen}
          title={t('chat.leoMoreHint')}
          aria-pressed={leoPanelOpen}
          aria-expanded={leoPanelOpen}
          onclick={() => {
            void unlockSpeechAudio()
            leoStillPickerOpen = false
            leoPanelOpen = !leoPanelOpen
          }}
        >
          <span class="context-chip-label"
            >{leoPanelOpen ? t('chat.leoMoreClose') : t('chat.leoMore')}</span
          >
        </button>
        {#if contextLabel}
          <span class="context-chip" title={contextLabel}>
            <span class="context-chip-label">{contextLabel}</span>
            {#if onClearContext}
              <button
                type="button"
                class="context-chip-x"
                aria-label={t('chat.clearScope')}
                onclick={onClearContext}
              >
                <Icon name="x" size={12} strokeWidth={2.5} />
              </button>
            {/if}
          </span>
          {#if contextMeta}
            <span class="context-meta">{contextMeta}</span>
          {/if}
        {/if}
      </div>
      {#if leoStillPickerOpen}
        <div
          class="leo-still-picker"
          data-testid="leo-still-picker"
          role="listbox"
          aria-label={t('chat.leoStillPicker')}
        >
          <div class="leo-still-picker-bar">
            <button
              type="button"
              class="context-chip leo-control"
              disabled={C.streaming}
              title={t('chat.leoStillQuickHint')}
              onclick={applyLeoStillQuick}
            >
              <span class="context-chip-label">{t('chat.leoStillQuick')}</span>
            </button>
            <button
              type="button"
              class="context-chip leo-control"
              disabled={leoImageDisabled || C.streaming}
              title={leoImageDisabled
                ? t('chat.leoImageDisabledHint')
                : t('chat.leoImageHint')}
              onclick={() => {
                leoStillPickerOpen = false
                void applyLeoImageDraft()
              }}
            >
              <span class="context-chip-label">{t('chat.leoImage')}</span>
            </button>
            <button
              type="button"
              class="context-chip"
              onclick={() => (leoStillPickerOpen = false)}
            >
              <span class="context-chip-label">{t('chat.leoStillClose')}</span>
            </button>
          </div>
          {#each leoStillGroups as group (group.id)}
            <div class="leo-still-group">
              <div class="leo-still-group-label">{group.label}</div>
              <div class="leo-still-grid">
                {#each group.items as item (item.id)}
                  <button
                    type="button"
                    class="leo-still-tile"
                    class:preferred={item.preferred}
                    role="option"
                    aria-selected={item.preferred}
                    title={item.label}
                    disabled={C.streaming}
                    onclick={() => applyLeoStillId(item.id)}
                  >
                    <img
                      src={item.src}
                      alt={item.label}
                      width="72"
                      height="72"
                      loading="lazy"
                      decoding="async"
                    />
                    <span class="leo-still-tile-label">{item.label}</span>
                  </button>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/if}
      {#if leoPanelOpen}
        <div class="leo-panel-groups" data-testid="leo-more-panel">
          <div class="leo-panel-group">
            <div class="leo-panel-group-label">{t('chat.leoPanelGroupScale')}</div>
            <div class="context-row">
              <button
                type="button"
                class="context-chip"
                class:leo-chip-on={leoStyle === 'roleplay'}
                title={t('chat.leoStyleHint')}
                aria-pressed={leoStyle === 'roleplay'}
                onclick={toggleLeoStyle}
              >
                <span class="context-chip-label"
                  >{leoStyle === 'roleplay'
                    ? t('chat.leoStyleRoleplay')
                    : t('chat.leoStyleChat')}</span
                >
              </button>
            </div>
          </div>
          <div class="leo-panel-group">
            <div class="leo-panel-group-label">{t('chat.leoPanelGroupPace')}</div>
            <div class="context-row" title={t('chat.leoFlowHint')}>
              <button
                type="button"
                class="context-chip"
                class:leo-chip-on={leoPace !== 'normal'}
                title={t('chat.leoPaceCycleHint')}
                aria-label={t('chat.leoPaceCycleHint')}
                onclick={cycleLeoPaceChip}
              >
                <span class="context-chip-label">{leoPaceChipLabel}</span>
              </button>
              <button
                type="button"
                class="context-chip leo-control"
                disabled={C.streaming}
                onclick={() => applyLeoControl('continue')}
              >
                <span class="context-chip-label">{t('chat.leoControlContinue')}</span>
              </button>
              <button
                type="button"
                class="context-chip leo-control"
                disabled={C.streaming}
                onclick={() => applyLeoControl('slow')}
              >
                <span class="context-chip-label">{t('chat.leoControlSlow')}</span>
              </button>
            </div>
          </div>
          <div class="leo-panel-group">
            <div class="leo-panel-group-label">{t('chat.leoPanelGroupScene')}</div>
            <div class="context-row leo-scenarios" data-testid="leo-scenario-row">
              {#each leoScenarioChips as sc (sc.id)}
                <button
                  type="button"
                  class="context-chip leo-scenario"
                  class:leo-chip-on={leoScenarioId === sc.id}
                  aria-pressed={leoScenarioId === sc.id}
                  onclick={() => setLeoScenario(sc.id)}
                >
                  <span class="context-chip-label">{t(sc.labelKey)}</span>
                </button>
              {/each}
              <button
                type="button"
                class="context-chip leo-control"
                class:leo-chip-on={leoStillPickerOpen}
                disabled={C.streaming}
                title={leoStillHint}
                aria-label={leoStillHint}
                aria-pressed={leoStillPickerOpen}
                data-testid="leo-still-chip"
                onclick={() => {
                  leoPanelOpen = false
                  toggleLeoStillPicker()
                }}
              >
                <span class="context-chip-label">{t('chat.leoStill')}</span>
              </button>
              <button
                type="button"
                class="context-chip leo-control"
                disabled={leoImageDisabled || C.streaming}
                title={leoImageDisabled
                  ? t('chat.leoImageDisabledHint')
                  : t('chat.leoImageHint')}
                aria-label={leoImageDisabled
                  ? t('chat.leoImageDisabledHint')
                  : t('chat.leoImageHint')}
                onclick={applyLeoImageDraft}
              >
                <span class="context-chip-label">{t('chat.leoImage')}</span>
              </button>
            </div>
          </div>
          <div class="leo-panel-group">
            <div class="leo-panel-group-label">{t('chat.leoPanelGroupSafety')}</div>
            <div class="context-row">
              <button
                type="button"
                class="context-chip"
                disabled={C.streaming}
                onclick={() => applyLeoControl('aftercare')}
              >
                <span class="context-chip-label">{t('chat.leoControlAftercare')}</span>
              </button>
              <button
                type="button"
                class="context-chip"
                disabled={C.streaming}
                onclick={() => applyLeoControl('submit')}
              >
                <span class="context-chip-label">{t('chat.leoControlSubmit')}</span>
              </button>
              <button
                type="button"
                class="context-chip"
                disabled={C.streaming}
                onclick={() => applyLeoControl('meaner')}
              >
                <span class="context-chip-label">{t('chat.leoControlMeaner')}</span>
              </button>
              <button
                type="button"
                class="context-chip"
                title={t('chat.leoControlOoc')}
                onclick={() => applyLeoControl('ooc')}
              >
                <span class="context-chip-label">{t('chat.leoControlOoc')}</span>
              </button>
              <a
                class="context-chip leo-settings"
                href="/settings"
                title={t('chat.leoModeHint')}>{t('chat.leoSettings')}</a
              >
            </div>
          </div>
        </div>
      {/if}
      {#if showLeoOpeners}
        <div
          class="context-row leo-openers"
          data-testid="leo-opener-row"
          aria-label={t('chat.leoOpenersHint')}
        >
          {#each leoOpenerPreview as op (op.id)}
            <button
              type="button"
              class="context-chip leo-opener"
              onclick={() => applyLeoOpener(op.text)}
            >
              <span class="context-chip-label">{op.text}</span>
            </button>
          {/each}
        </div>
      {/if}
    {:else if contextLabel}
      <div class="context-row" data-testid="composer-context-row">
        <span class="context-chip" title={contextLabel}>
          <span class="context-chip-label">{contextLabel}</span>
          {#if onClearContext}
            <button
              type="button"
              class="context-chip-x"
              aria-label={t('chat.clearScope')}
              onclick={onClearContext}
            >
              <Icon name="x" size={12} strokeWidth={2.5} />
            </button>
          {/if}
        </span>
        {#if contextMeta}
          <span class="context-meta">{contextMeta}</span>
        {/if}
      </div>
    {/if}
  {#if images.length || files.length || importing > 0}
    <div class="attachments">
      {#each images as src, i (i)}
        <div class="thumb">
          <img {src} alt={t('chat.attachedImage')} />
          <button
            type="button"
            class="thumb-x"
            aria-label={t('chat.removeImage')}
            onclick={() => removeImage(i)}
          >
            <Icon name="x" size={12} strokeWidth={2.5} />
          </button>
        </div>
      {/each}
      {#each files as file, i (file.name + i)}
        <div class="file-pill">
          <Icon
            name={file.kind === 'audio' ? 'mic' : 'file'}
            size={14}
            strokeWidth={1.75}
          />
          <span class="file-pill-name">{file.name}</span>
          <button
            type="button"
            class="file-pill-x"
            aria-label={t('chat.removeFile')}
            onclick={() => removeFile(i)}
          >
            <Icon name="x" size={12} strokeWidth={2.5} />
          </button>
        </div>
      {/each}
      {#if importing > 0}
        <div class="file-pill importing">
          <span class="import-dot"></span>
          {t('chat.importingFile')}
        </div>
      {/if}
    </div>
  {/if}

  <div class="row">
    <button
      bind:this={menuBtn}
      type="button"
      class="aux-btn"
      class:active={menuOpen}
      title={t('chat.openMenu')}
      aria-label={t('chat.openMenu')}
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      onclick={() => (menuOpen = !menuOpen)}
    >
      <Icon name="plus" size={19} strokeWidth={1.9} />
    </button>
    {#if menuOpen}
      <div
        bind:this={menuEl}
        class="menu"
        role="menu"
        aria-label={t('chat.openMenu')}
      >
        {#each menuItems as item (item.key)}
          <button
            type="button"
            role="menuitem"
            class="menu-item"
            onclick={() => menuAction(item)}
          >
            <span class="menu-icon">
              <Icon name={item.icon} size={16} strokeWidth={1.8} />
            </span>
            <span class="menu-title">{item.title}</span>
            <span class="menu-desc">{item.desc}</span>
          </button>
        {/each}
      </div>
    {/if}
    <input
      bind:this={fileInput}
      type="file"
      accept={IMPORT_ACCEPT}
      multiple
      hidden
      onchange={onFilesPicked}
    />

    <textarea
      bind:this={textarea}
      bind:value={text}
      rows="1"
      enterkeyhint="send"
      autocomplete="off"
      autocorrect="on"
      autocapitalize="sentences"
      spellcheck="true"
      placeholder={resolvedPlaceholder}
      aria-label={resolvedPlaceholder}
      oninput={onInput}
      onkeydown={onKeydown}
      onpaste={onPaste}
      oncompositionstart={ime.compositionstart}
      oncompositionend={(e) => ime.compositionend(e)}
      oncompositioncancel={ime.compositioncancel}
    ></textarea>

    <button
      type="button"
      class="aux-btn mic"
      class:active={recording}
      class:leo-talk={leoHandsFree}
      title={recording
        ? t('chat.stopRecording')
        : leoHandsFree
          ? t('chat.leoTalkMic')
          : t('chat.voiceInput')}
      aria-label={recording
        ? t('chat.stopRecording')
        : leoHandsFree
          ? t('chat.leoTalkMic')
          : t('chat.voiceInput')}
      aria-pressed={recording}
      disabled={transcribing}
      onclick={toggleRecording}
    >
      <Icon name="mic" size={18} strokeWidth={1.9} />
    </button>

    <button
      type="button"
      class="send-btn"
      class:stop={C.streaming}
      disabled={!canSend && !C.streaming}
      title={C.streaming ? t('chat.stop') : t('chat.send')}
      aria-label={C.streaming ? t('chat.stop') : t('chat.send')}
      onclick={submit}
    >
      {#if C.streaming}
        <Icon name="stop" size={14} strokeWidth={2.5} />
      {:else}
        <Icon name="arrow-up" size={18} strokeWidth={2.25} />
      {/if}
    </button>
  </div>
</div>

{#if dragging}
  <div class="drop-overlay" aria-hidden="true">
    <div class="drop-overlay-inner">
      <Icon name="paperclip" size={26} strokeWidth={1.6} />
      <span>{t('chat.dropToUpload')}</span>
    </div>
  </div>
{/if}

<style>
  /* —— 整页拖拽上传遮罩 —— */
  .drop-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    padding: 24px;
    background: color-mix(in srgb, var(--bg) 68%, transparent);
    pointer-events: none;
    animation: drop-in 120ms var(--ease, ease);
  }
  .drop-overlay-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 36px 56px;
    border: 2px dashed var(--accent);
    border-radius: 22px;
    background: var(--bg);
    color: var(--t1);
    font-size: var(--text-base, 15px);
    font-weight: 550;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
  }
  .drop-overlay-inner :global(svg) {
    color: var(--accent);
  }
  @keyframes drop-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .drop-overlay {
      animation: none;
    }
  }

  .composer {
    position: relative;
    display: grid;
    gap: 8px;
    width: 100%;
    padding: 8px 10px;
    background: color-mix(in srgb, var(--bg-2, var(--card)) 55%, var(--bg));
    border: 1px solid color-mix(in srgb, var(--t1) 10%, transparent);
    border-radius: 24px;
    box-shadow: 0 1px 0 color-mix(in srgb, #fff 55%, transparent) inset;
    transition:
      border-color 160ms ease,
      background 160ms ease,
      box-shadow 160ms ease;
  }

  .context-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 0 2px;
  }
  .context-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 100%;
    min-height: 28px;
    padding: 2px 8px 2px 10px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--t1) 6%, transparent);
    color: color-mix(
      in srgb,
      var(--t1) calc(var(--kenos-emphasis-secondary, 0.68) * 100%),
      transparent
    );
    font-size: 12px;
    font-weight: 550;
    letter-spacing: 0.01em;
  }
  .context-chip-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .context-chip-x {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .context-chip-x:hover {
    background: color-mix(in srgb, var(--t1) 10%, transparent);
  }
  a.context-chip {
    text-decoration: none;
    color: inherit;
  }
  button.context-chip {
    border: 0;
    cursor: pointer;
    font: inherit;
  }
  button.leo-chip {
    background: color-mix(in srgb, #c45c26 16%, transparent);
    color: color-mix(in srgb, #c45c26 88%, var(--t1));
  }
  button.leo-control-stop {
    background: color-mix(in srgb, #a33a4a 16%, transparent);
    color: color-mix(in srgb, #a33a4a 88%, var(--t1));
    font-weight: 600;
  }
  button.leo-chip-explicit {
    background: color-mix(in srgb, #a33a4a 18%, transparent);
    color: color-mix(in srgb, #a33a4a 90%, var(--t1));
  }
  .leo-chip-on {
    background: color-mix(in srgb, #c45c26 22%, transparent);
    color: color-mix(in srgb, #c45c26 92%, var(--t1));
  }
  button.context-chip:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  a.leo-settings {
    opacity: 0.75;
  }
  .leo-scenarios,
  .leo-openers {
    margin-top: -2px;
  }
  .leo-scenario {
    font-weight: 500;
  }
  /* —— 「更多」面板:按尺度/节奏/场景/安全分组,折叠时不占空间 —— */
  .leo-panel-groups {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 6px 2px 2px;
    margin-top: 2px;
    border-top: 1px solid color-mix(in srgb, var(--t1) 8%, transparent);
  }
  .leo-panel-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .leo-panel-group-label {
    padding: 0 6px;
    font-size: 10px;
    font-weight: 650;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--t1) 42%, transparent);
  }

  /* —— 瞬间 moment picker（行业：选图发瞬间）—— */
  .leo-still-picker {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: min(42vh, 360px);
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 8px 2px 4px;
    margin-top: 2px;
    border-top: 1px solid color-mix(in srgb, var(--t1) 8%, transparent);
  }
  .leo-still-picker-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .leo-still-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .leo-still-group-label {
    padding: 0 4px;
    font-size: 10px;
    font-weight: 650;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--t1) 42%, transparent);
  }
  .leo-still-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
    gap: 8px;
  }
  .leo-still-tile {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--bg-2, var(--bg));
    overflow: hidden;
    cursor: pointer;
    color: inherit;
    text-align: start;
    -webkit-tap-highlight-color: transparent;
    transition:
      border-color 140ms ease,
      transform 140ms ease;
  }
  .leo-still-tile:hover,
  .leo-still-tile:focus-visible {
    border-color: color-mix(in oklab, var(--accent, #c48) 45%, var(--border));
    outline: none;
  }
  .leo-still-tile.preferred {
    border-color: color-mix(in oklab, var(--accent, #c48) 55%, var(--border));
    box-shadow: 0 0 0 1px color-mix(in oklab, var(--accent, #c48) 22%, transparent);
  }
  .leo-still-tile:active {
    transform: scale(0.98);
  }
  .leo-still-tile:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .leo-still-tile img {
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    object-position: center 18%;
    display: block;
    background: var(--bg-2);
  }
  .leo-still-tile-label {
    padding: 0 6px 6px;
    font-size: 10px;
    font-weight: 550;
    line-height: 1.2;
    color: var(--t2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .leo-opener {
    max-width: min(100%, 220px);
    font-weight: 500;
  }
  .leo-opener .context-chip-label {
    white-space: nowrap;
  }
  button.leo-control:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .context-meta {
    font-size: 11px;
    font-weight: 500;
    color: color-mix(
      in srgb,
      var(--t1) calc(var(--kenos-emphasis-secondary, 0.68) * 100%),
      transparent
    );
    opacity: 0.85;
  }

  /* —— 「+」能力菜单 —— */
  .menu {
    position: absolute;
    bottom: calc(100% + 10px);
    inset-inline-start: 0;
    z-index: 30;
    min-width: 300px;
    max-width: min(420px, calc(100vw - 32px));
    padding: 6px;
    display: grid;
    gap: 2px;
    background: var(--bg);
    border: 1px solid var(--border-l);
    border-radius: 18px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.16);
  }
  .menu-item {
    display: grid;
    grid-template-columns: 28px auto 1fr;
    align-items: center;
    column-gap: 10px;
    width: 100%;
    padding: 9px 12px 9px 8px;
    border: none;
    border-radius: 12px;
    background: transparent;
    color: var(--t1);
    font: inherit;
    font-size: var(--text-sm, 14px);
    text-align: start;
    cursor: pointer;
  }
  .menu-item:hover,
  .menu-item:focus-visible {
    background: var(--card);
  }
  .menu-icon {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: var(--bg-2);
    color: var(--t2);
  }
  .menu-title {
    font-weight: 550;
    white-space: nowrap;
  }
  .menu-desc {
    color: var(--t3);
    font-size: var(--text-xs, 12px);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .aux-btn.active {
    background: var(--card);
    color: var(--t1);
  }
  .composer:focus-within {
    border-color: color-mix(in srgb, var(--t1) 18%, transparent);
    background: color-mix(in srgb, var(--bg) 92%, var(--card));
  }
  .leo-voice-status {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 4px 12px 0;
    font-size: 12px;
    font-weight: 550;
    letter-spacing: 0.01em;
    color: var(--accent, #c45c26);
  }
  .leo-voice-status-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .leo-voice-dot {
    flex: 0 0 auto;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.5;
    transition: opacity 180ms ease;
  }
  .leo-voice-dot.active {
    opacity: 1;
    animation: leo-mic-pulse 1.1s ease-in-out infinite;
  }
  .composer.leo-handsfree {
    transition:
      border-color 200ms ease,
      box-shadow 200ms ease;
  }
  .composer.recording {
    border-color: color-mix(in srgb, var(--t1) 28%, transparent);
  }
  .composer.leo-handsfree.recording {
    border-color: color-mix(in srgb, #c45c26 42%, transparent);
    box-shadow: 0 0 24px color-mix(in oklab, #c45c26 18%, transparent);
  }
  @keyframes leo-mic-pulse {
    0%,
    100% {
      transform: scale(1);
      opacity: 0.7;
      box-shadow: 0 0 0 0 color-mix(in oklab, #c45c26 40%, transparent);
    }
    50% {
      transform: scale(1.35);
      opacity: 1;
      box-shadow: 0 0 0 6px color-mix(in oklab, #c45c26 0%, transparent);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .leo-voice-dot.active {
      animation: none;
      opacity: 1;
    }
  }

  .row {
    display: flex;
    align-items: flex-end;
    gap: 4px;
  }

  .attachments {
    display: flex;
    gap: 8px;
    padding: 2px 4px 0;
    flex-wrap: wrap;
  }
  .thumb {
    position: relative;
    width: 56px;
    height: 56px;
    border-radius: 10px;
    overflow: hidden;
    border: 1px solid var(--border);
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .thumb-x {
    position: absolute;
    top: 3px;
    right: 3px;
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border: none;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.65);
    color: #fff;
    cursor: pointer;
  }

  .file-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 220px;
    height: 34px;
    padding: 0 6px 0 10px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg-2);
    color: var(--t1);
    font-size: var(--text-sm, 13px);
  }
  .file-pill :global(svg) {
    color: var(--t3);
    flex: 0 0 auto;
  }
  .file-pill-name {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .file-pill-x {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--t3);
    cursor: pointer;
    flex: 0 0 auto;
  }
  .file-pill-x:hover {
    color: var(--t1);
    background: var(--card);
  }
  .file-pill.importing {
    color: var(--t3);
    gap: 8px;
    padding-inline-end: 12px;
  }
  .import-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--t3);
    animation: import-pulse 1s ease-in-out infinite;
  }
  @keyframes import-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
  }

  textarea {
    flex: 1;
    min-width: 0;
    max-height: 200px;
    border: none;
    background: transparent;
    resize: none;
    outline: none;
    color: var(--t1);
    font: inherit;
    /* ≥16px on iOS — smaller scoped sizes override theme and zoom the page */
    font-size: max(16px, var(--text-base, 15px));
    line-height: 1.45;
    padding: 7px 4px;
  }
  textarea::placeholder {
    color: color-mix(in srgb, var(--t3) 92%, transparent);
  }

  .aux-btn {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--t2);
    cursor: pointer;
    transition:
      background 160ms ease,
      color 160ms ease;
  }
  .aux-btn:hover {
    background: color-mix(in srgb, var(--t1) 8%, transparent);
    color: var(--t1);
  }
  .aux-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .aux-btn.mic.leo-talk:not(.active) {
    color: var(--accent, #c45c26);
  }
  .aux-btn.mic.active {
    background: var(--accent);
    color: var(--on-accent);
    animation: mic-pulse 1.2s ease-in-out infinite;
  }
  @keyframes mic-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.6;
    }
  }

  .send-btn {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 50%;
    background: var(--t1);
    color: var(--bg);
    cursor: pointer;
    transition:
      opacity 160ms ease,
      transform 160ms ease,
      background 160ms ease;
  }
  .send-btn:disabled {
    opacity: 0.22;
    cursor: default;
  }
  .send-btn:not(:disabled):active {
    transform: scale(0.94);
  }
  .send-btn.stop {
    background: var(--t1);
  }

  /* —— 窄屏(手机):进一步收紧 Leo chip 区域,避免主路径以外的行常驻挤占输入框 —— */
  @media (max-width: 480px) {
    .composer {
      padding: 6px 8px;
      gap: 6px;
    }
    .context-row {
      gap: 4px;
    }
    .context-chip {
      min-height: 26px;
      padding: 2px 7px 2px 9px;
      font-size: 11px;
    }
    .leo-panel-groups {
      gap: 6px;
      padding-top: 5px;
    }
    .leo-panel-group-label {
      font-size: 9px;
      padding: 0 5px;
    }
    .leo-voice-status {
      padding: 3px 10px 0;
      font-size: 11px;
    }
  }
</style>
