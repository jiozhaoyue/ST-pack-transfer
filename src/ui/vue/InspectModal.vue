<template>
  <div v-if="isOpen" class="inspect-modal-overlay" @click.self="handleClose">
    <div class="inspect-modal-card" role="dialog" aria-modal="true">
      <header class="modal-header">
        <div class="modal-title-wrap">
          <span class="icon">🩺</span>
          <h3 class="modal-title">{{ title || t('inspect.reportTitle') }}</h3>
        </div>
        <button type="button" class="close-btn" @click="handleClose" :aria-label="t('inspect.close')">×</button>
      </header>

      <div class="modal-body">
        <!-- 总体结论横幅 -->
        <div :class="['verdict-banner', verdictStatus]">
          <span class="verdict-icon">{{ verdictStatus === 'pass' ? '✓' : '⚠' }}</span>
          <span class="verdict-text">{{ report?.verdict || t('inspect.analyzing') }}</span>
        </div>

        <!-- A~E 五层分级展示 -->
        <div class="layers-list">
          <section class="layer-item" v-for="(layer, key) in layers" :key="key">
            <header class="layer-head">
              <span class="layer-badge">{{ layer.code }}</span>
              <span class="layer-name">{{ layer.name }}</span>
              <span :class="['layer-status', layer.ok ? 'ok' : 'warn']">
                {{ t(layer.ok ? 'inspect.severity.ok' : 'inspect.severity.warn') }}
              </span>
            </header>
            <div class="layer-content">
              <p class="layer-desc">{{ layer.summary }}</p>
              <ul v-if="layer.details?.length" class="layer-details">
                <li v-for="(item, idx) in layer.details" :key="idx">{{ item }}</li>
              </ul>
            </div>
          </section>
        </div>
      </div>

      <footer class="modal-footer">
        <button type="button" class="btn btn-secondary" @click="handleClose">{{ t('inspect.close') }}</button>
        <!-- Save to workspace after a passing inspection -->
        <button
          v-if="canSaveToWorkspace"
          type="button"
          class="btn btn-primary save-btn"
          @click="handleSaveToWorkspace"
        >
          {{ t('pending.stash') }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { t } from '../../i18n/index.js';

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  report: { type: Object, default: () => null },
  title: { type: String, default: '' },
});

const emit = defineEmits(['close', 'save-to-workspace']);

const verdictStatus = computed(() => {
  return props.report?.ok ? 'pass' : 'warn';
});

const canSaveToWorkspace = computed(() => {
  return props.report?.blob && props.report?.ok;
});

const layers = computed(() => {
  const r = props.report || {};
  return {
    layerA: {
      code: 'A',
      name: t('inspect.layer.bytes'),
      ok: !r.emptyFile && !r.truncated,
      summary: r.layerA?.summary || t('inspect.layerA.summary'),
    },
    layerB: {
      code: 'B',
      name: t('inspect.layer.zip'),
      ok: !r.corruptZip,
      summary: r.layerB?.summary || t('inspect.layerB.summary'),
    },
    layerC: {
      code: 'C',
      name: t('inspect.layer.entries'),
      ok: true,
      summary: t('inspect.layerC.summary', { total: r.entryCount || 0, empty: r.zeroByteCount || 0 }),
    },
    layerD: {
      code: 'D',
      name: t('inspect.layer.semantic'),
      ok: !!r.layout,
      summary: t('inspect.layerD.summary', { layout: r.layout || t('inspect.layoutUnknown') }),
    },
    layerE: {
      code: 'E',
      name: t('inspect.layer.convertible'),
      ok: r.convertible ?? true,
      summary: r.convertible
        ? t('inspect.layerE.ok')
        : t('inspect.layerE.partial'),
    },
  };
});

function handleClose() {
  emit('close');
}

function handleSaveToWorkspace() {
  if (props.report?.blob) {
    emit('save-to-workspace', props.report);
  }
}
</script>

<style scoped>
.inspect-modal-overlay {
  position: fixed;
  inset: 0;
  /* 层叠：须高于工作台模态 #st-converter-modal-overlay 的 10000（style.css:2146），
     且低于教程浮层 #st-pt-tutorial-overlay 的 2147483000（style.css:1674）。 */
  z-index: 10050;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 配色令牌分层：语义判定色固定（pass=绿 / warn=橙），不绑宿主随机色相令牌；
     结构色（面板底 / 遮罩 / 描边）仍继承 --SmartTheme* 回退。
     本浮层挂在 body 直系节点、非 #app 后代，故不依赖 style.css 的派生令牌。 */
  --im-scrim: var(--SmartThemeShadowColor, rgba(0, 0, 0, 0.7));
  --im-success-line: rgba(76, 175, 80, 0.4);
  --im-success-tint: rgba(76, 175, 80, 0.15);
  --im-success-soft: rgba(76, 175, 80, 0.1);
  --im-warn-line: rgba(255, 152, 0, 0.4);
  --im-warn-tint: rgba(255, 152, 0, 0.15);
  --im-warn-soft: rgba(255, 152, 0, 0.1);
  --im-surface-2: var(--SmartThemeBodyColorInverted, rgba(255, 255, 255, 0.02));
  --im-surface-8: var(--SmartThemeBodyColorInverted, rgba(255, 255, 255, 0.08));
  --im-surface-10: var(--SmartThemeBodyColorInverted, rgba(255, 255, 255, 0.1));
  --im-surface-12: var(--SmartThemeBodyColorInverted, rgba(255, 255, 255, 0.12));
  background: var(--im-scrim);
  backdrop-filter: blur(4px);
  padding: 16px;
}

.inspect-modal-card {
  width: 100%;
  max-width: 620px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background: var(--SmartThemeBodyColor, #1a1a1a);
  border: 1px solid var(--SmartThemeBorderColor, #333);
  border-radius: 12px;
  box-shadow: 0 12px 32px var(--SmartThemeShadowColor, rgba(0, 0, 0, 0.5));
  overflow: hidden;
  color: var(--SmartThemeQuoteColor, #e0e0e0);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--SmartThemeBorderColor, #333);
}

.modal-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.modal-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.close-btn {
  background: transparent;
  border: none;
  font-size: 20px;
  color: var(--SmartThemeQuoteColor, #888);
  cursor: pointer;
}

.close-btn:hover {
  color: var(--SmartThemeEmColor, #fff);
}

.modal-body {
  padding: 16px 18px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.verdict-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
}

.verdict-banner.pass {
  background: var(--im-success-tint);
  border: 1px solid var(--im-success-line);
  color: var(--SmartThemeEmColor, #81c784);
}

.verdict-banner.warn {
  background: var(--im-warn-tint);
  border: 1px solid var(--im-warn-line);
  color: var(--SmartThemeQuoteColor, #ffb74d);
}

.layers-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.layer-item {
  border: 1px solid var(--im-surface-8);
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--im-surface-2);
}

.layer-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.layer-badge {
  background: var(--im-surface-10);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: bold;
}

.layer-name {
  font-size: 13px;
  font-weight: 600;
  flex: 1;
}

.layer-status {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
}

.layer-status.ok {
  color: var(--SmartThemeEmColor, #81c784);
  background: var(--im-success-soft);
}

.layer-status.warn {
  color: var(--SmartThemeQuoteColor, #ffb74d);
  background: var(--im-warn-soft);
}

.layer-desc {
  margin: 0;
  font-size: 12px;
  color: var(--SmartThemeQuoteColor, #aaa);
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 18px;
  border-top: 1px solid var(--SmartThemeBorderColor, #333);
}

.btn {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid transparent;
}

.btn-secondary {
  background: var(--im-surface-8);
  color: var(--SmartThemeBodyColor, #ccc);
  border-color: var(--im-surface-12);
}

.btn-primary {
  background: var(--SmartThemeQuoteColor, #e53935);
  color: var(--SmartThemeBodyColor, #fff);
}

.btn-primary:hover {
  background: var(--SmartThemeQuoteColor, #f44336);
}
</style>
