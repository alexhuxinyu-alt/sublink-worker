/** @jsxRuntime automatic */
/** @jsxImportSource hono/jsx */
import { PREDEFINED_RULE_SETS, UNIFIED_RULES } from '../config/index.js';
import { CustomRules } from './CustomRules.jsx';
import { TextareaWithActions } from './TextareaWithActions.jsx';
import { ValidatedTextarea } from './ValidatedTextarea.jsx';
import { formLogicFn } from './formLogic.js';

const LINK_FIELDS = [
  { key: 'xray', labelKey: 'xrayLink' },
  { key: 'singbox', labelKey: 'singboxLink' },
  { key: 'clash', labelKey: 'clashLink' },
  { key: 'surge', labelKey: 'surgeLink' }
];

const CARD = 'rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-700/80 dark:bg-slate-900/80';
const FIELD = 'rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-base text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-950/70 dark:text-white';
const PRIMARY_BUTTON = 'inline-flex min-h-11 items-center justify-center rounded-xl bg-primary-700 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 disabled:opacity-50';
const SECONDARY_BUTTON = 'min-h-10 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 disabled:opacity-50 dark:border-slate-600 dark:text-gray-200 dark:hover:bg-slate-800';

const SourcePicker = ({ target }) => (
  <details
    x-data={`sourcePickerData('${target}')`}
    x-on:toggle="toggleSourcePicker($el.open)"
    class="mb-3 rounded-xl border border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-950/60"
  >
    <summary class="min-h-11 cursor-pointer px-3 py-3 text-sm font-medium text-gray-800 marker:text-primary-600 dark:text-gray-200 dark:marker:text-primary-400">从 3x-ui 选来源</summary>
    <div class="space-y-3 px-3 pb-3 text-sm text-gray-600 dark:text-gray-300">
      <p>按客户端 Email 匹配。选好服务器后，先预览再填入草稿。</p>
      <label x-show="sourceUsers.length" class="block">
        <span class="mb-1 block font-medium">客户端 Email</span>
        <select x-model="sourceEmail" x-on:change="sourceServerIds = []; clearSourcePreview()" x-bind:disabled="sourceBusy" class={`${FIELD} w-full`}>
          <option value="">选择用户</option>
          <template x-for="user in sourceUsers" x-bind:key="user.email">
            <option x-bind:value="user.email" x-text="user.email"></option>
          </template>
        </select>
      </label>
      <fieldset x-show="sourceEmail" x-bind:disabled="sourceBusy" class="space-y-2">
        <legend class="font-medium">服务器</legend>
        <div class="flex flex-wrap gap-2">
          <template x-for="server in sourceServerChoices()" x-bind:key="server.id">
            <label class="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 dark:border-slate-700">
              <input type="checkbox" x-bind:value="server.id" x-model="sourceServerIds" x-on:change="clearSourcePreview()" class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
              <span x-text="server.name"></span>
            </label>
          </template>
        </div>
      </fieldset>
      <div class="flex flex-wrap gap-2">
        <button type="button" x-show="sourceUsers.length" x-on:click="previewSourceLinks()" x-bind:disabled="sourceBusy || !sourceServerIds.length" class={SECONDARY_BUTTON}>预览来源</button>
        <button type="button" x-on:click="refreshSourceCatalog()" x-bind:disabled="sourceBusy" class={SECONDARY_BUTTON}>刷新服务器列表</button>
      </div>
      <p x-show="sourceUnavailable.length" class="text-amber-700 dark:text-amber-300">
        暂未同步的服务器：<span x-text="sourceUnavailable.map(server => server.name).join('、')"></span>
      </p>
      <p x-show="sourceMessage" x-text="sourceMessage" role="status"></p>
      <div x-show="sourcePreview.length" class="space-y-2 rounded-lg border border-gray-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <p class="font-medium">将填入的来源</p>
        <ul class="list-inside list-disc">
          <template x-for="source in sourcePreview" x-bind:key="source.id">
            <li x-text="source.name"></li>
          </template>
        </ul>
        <p>{target === 'managed' ? '填入会替换下方来源草稿，点击「保存到原订阅」才会更新订阅。' : '填入会替换输入框里的内容，可以核对后再点击「转换」。'}</p>
        <button type="button" x-on:click="applySourcePreview()" x-bind:disabled="sourceBusy" class={PRIMARY_BUTTON}>{target === 'managed' ? '替换来源草稿' : '填入输入框'}</button>
      </div>
    </div>
  </details>
);

const RuleChoices = ({ t, model, onChange, disabled }) => (
  <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {UNIFIED_RULES.map((rule) => (
      <label class="group flex cursor-pointer items-center rounded-lg border border-gray-200 p-3 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50">
        <input
          type="checkbox"
          value={rule.name}
          x-model={model}
          x-on:change={onChange}
          x-bind:disabled={disabled}
          class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700"
        />
        <span class="ml-3 text-sm font-medium text-gray-700 transition-colors group-hover:text-gray-900 dark:text-gray-300 dark:group-hover:text-white">
          {t(`outboundNames.${rule.name}`)}
        </span>
      </label>
    ))}
  </div>
);

export const Form = (props) => {
  const { t, lang, sourceBridgeEnabled } = props;

  const translations = {
    processing: t('processing'),
    convert: t('convert'),
    saveConfigSuccess: t('saveConfigSuccess'),
    saveConfig: t('saveConfig'),
    savingConfig: t('savingConfig'),
    configContentRequired: t('configContentRequired'),
    configSaveFailed: t('configSaveFailed'),
    confirmClearConfig: t('confirmClearConfig'),
    confirmClearAll: t('confirmClearAll'),
    errorGeneratingLinks: t('errorGeneratingLinks'),
    shortenLinks: t('shortenLinks'),
    shortening: t('shortening'),
    alreadyShortened: t('alreadyShortened'),
    shortenFailed: t('shortenFailed'),
    customShortCode: t('customShortCode'),
    optional: t('optional'),
    customShortCodePlaceholder: t('customShortCodePlaceholder'),
    showFullLinks: t('showFullLinks'),
    rulePresetNames: {
      minimal: t('minimal'),
      balanced: t('balanced'),
      comprehensive: t('comprehensive'),
      custom: t('custom')
    }
  };

  const scriptContent = `
    window.APP_TRANSLATIONS = ${JSON.stringify(translations)};
    window.PREDEFINED_RULE_SETS = ${JSON.stringify(PREDEFINED_RULE_SETS)};
    window.APP_LANG = ${JSON.stringify(lang || 'zh-CN')};
    if (typeof __name === 'undefined') { var __name = function(fn) { return fn; }; }
    (${formLogicFn.toString()})();
  `;

  return (
    <div x-data="formData()" x-init="init()" class="max-w-4xl mx-auto">
      <section class={`${CARD} mb-5 sm:mb-6`}>
        <h2 class="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-sm text-primary-700 dark:bg-primary-950 dark:text-primary-300" aria-hidden="true">
            <i class="fas fa-link"></i>
          </span>
          编辑已有订阅
        </h2>
        <p class="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">优先显示你填写的备注，否则按短码前缀识别；编辑来源后链接保持不变。</p>
        <details class="mt-4 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-600 dark:border-slate-700 dark:bg-slate-950/60 dark:text-gray-300">
          <summary class="min-h-11 cursor-pointer px-3 py-3 font-medium text-gray-800 marker:text-primary-600 dark:text-gray-200 dark:marker:text-primary-400">管理用户识别名</summary>
          <div class="space-y-2 px-3 pb-3">
            <p>用逗号或空格分隔用户名。新用户可在此添加；系统按最长前缀匹配。</p>
            <textarea x-model="managedKnownNames" rows="2" placeholder="例如 Alex, CSM, HYB" class={`${FIELD} block w-full`}></textarea>
            <button type="button" x-on:click="saveManagedNames()" class={PRIMARY_BUTTON}>保存识别名</button>
          </div>
        </details>
        <details class="mt-2 rounded-xl border border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-950/60">
          <summary class="min-h-11 cursor-pointer px-3 py-3 text-sm font-medium text-gray-800 marker:text-primary-600 dark:text-gray-200 dark:marker:text-primary-400">
            已有订阅 <span class="ml-1 rounded-full bg-primary-100 px-2 py-0.5 text-xs tabular-nums text-primary-800 dark:bg-primary-950 dark:text-primary-300" x-text="managedSubscriptions.length"></span>
          </summary>
          <div class="space-y-2 px-3 pb-3">
            <div class="flex justify-end">
              <button type="button" x-on:click="refreshManagedSubscriptions()" x-bind:disabled="managedListBusy || managedRowBusy" class="text-sm text-primary-600 dark:text-primary-400 disabled:opacity-50">刷新列表</button>
            </div>
            <p x-cloak x-show="managedListMessage" x-text="managedListMessage" role="status" class="text-sm text-gray-600 dark:text-gray-300"></p>
            <template x-for="subscription in managedSubscriptions" x-bind:key="subscription.code">
              <details class="rounded-lg border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                <summary class="min-h-11 cursor-pointer break-all px-3 py-3 text-sm font-semibold text-gray-900 marker:text-primary-600 dark:text-white dark:marker:text-primary-400">
                  <span x-text="subscription.displayName || '未识别'"></span>
                  <span x-cloak x-show="subscription.disabled" class="ml-2 text-sm font-normal text-amber-600 dark:text-amber-400">来源已标记停用</span>
                </summary>
                <div class="space-y-3 px-3 pb-3">
                  <p class="break-all rounded-lg bg-gray-50 px-2.5 py-2 font-mono text-xs text-gray-600 dark:bg-slate-950 dark:text-gray-400" x-text="`${window.location.origin}/c/${subscription.code}`"></p>
                  <div>
                    <div class="flex flex-wrap items-center gap-2">
                      <input type="text" x-model="subscription.remark" x-on:input="subscription.remarkStatus = ''" x-bind:disabled="managedRowBusy" maxlength="80" aria-label="订阅备注名" placeholder="填写备注名（选填）" class={`${FIELD} min-h-11 min-w-0 flex-1`} />
                      <button type="button" x-on:click="saveSubscriptionRemark(subscription)" x-bind:disabled="managedRowBusy || managedListBusy" class="min-h-11 shrink-0 rounded-lg bg-primary-50 px-2.5 text-sm font-medium text-primary-800 hover:bg-primary-100 dark:bg-primary-950 dark:text-primary-300 dark:hover:bg-primary-900 disabled:opacity-50">保存备注</button>
                    </div>
                    <p x-show="subscription.remarkStatus" x-text="subscription.remarkStatus" role="status" x-bind:class="subscription.remarkError ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'" class="mt-1 text-sm"></p>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <button type="button" x-on:click="selectManagedSubscription(subscription.code)" x-bind:disabled="managedBusy || managedRowBusy" class={PRIMARY_BUTTON}>选择编辑</button>
                    <button type="button" x-on:click="subscription.confirmDelete = true" x-bind:disabled="managedBusy || managedRowBusy || managedListBusy" x-show="!subscription.confirmDelete" class="min-h-11 rounded-lg px-3 py-2 text-sm text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40 disabled:opacity-50">删除订阅</button>
                  </div>
                  <div x-show="subscription.confirmDelete" class="rounded-lg border border-red-200 px-3 py-2 dark:border-red-900">
                    <p class="text-sm text-red-800 dark:text-red-300">删除后，此短码的所有格式订阅链接都会失效，客户端将无法再更新。</p>
                    <div class="mt-2 flex flex-wrap items-center gap-3">
                      <button type="button" x-on:click="deleteManagedSubscription(subscription)" x-bind:disabled="managedBusy || managedRowBusy || managedListBusy" class="rounded-lg bg-red-700 px-3 py-1.5 text-sm text-white disabled:opacity-50">确认删除</button>
                      <button type="button" x-on:click="subscription.confirmDelete = false; subscription.deleteStatus = ''" x-bind:disabled="managedRowBusy" class="text-sm text-gray-700 dark:text-gray-200 disabled:opacity-50">取消</button>
                    </div>
                    <p x-show="subscription.deleteStatus" x-text="subscription.deleteStatus" role="status" class="mt-1 text-sm text-red-700 dark:text-red-400"></p>
                  </div>
                </div>
              </details>
            </template>
          </div>
        </details>
        <div class="mt-4 border-t border-gray-200 pt-4 dark:border-slate-700">
          <label for="managedLink" class="text-sm leading-relaxed text-gray-600 dark:text-gray-400">也可以粘贴其他格式的本站固定订阅链接：</label>
          <div class="mt-2 flex flex-col gap-2 sm:flex-row">
            <input id="managedLink" type="url" x-model="managedLink" x-bind:disabled="managedBusy || managedRowBusy" x-on:input="resetManagedEditor()" placeholder="粘贴本站已有的订阅短链接" class={`${FIELD} min-h-11 min-w-0 flex-1`} />
            <button type="button" x-on:click="loadManagedSubscription()" x-bind:disabled="managedBusy || managedRowBusy" class={`${PRIMARY_BUTTON} shrink-0 whitespace-nowrap`}>载入订阅</button>
          </div>
        </div>
        <div x-cloak x-show="managedCode" class="mt-4">
          {sourceBridgeEnabled && (
            <template x-if="managedCode">
              <SourcePicker target="managed" />
            </template>
          )}
          <label for="managedSources" class="block text-sm font-medium text-gray-700 dark:text-gray-200">订阅来源（每行一个）</label>
          <textarea id="managedSources" x-model="managedSources" x-bind:disabled="managedBusy || managedRowBusy" rows="5" class={`${FIELD} mt-2 block w-full`}></textarea>
          <details x-ref="managedRuleOptions" class="mt-3 rounded-xl border border-gray-200 p-3 dark:border-slate-700">
            <summary class="cursor-pointer text-sm font-medium text-gray-800 dark:text-gray-200">修改这条订阅的分流规则</summary>
            <div class="mt-3">
              <select aria-label="已有订阅的分流规则" x-model="managedRulePreset" x-on:change="applyManagedRulePreset()" x-bind:disabled="managedBusy || managedRowBusy" class={FIELD}>
                <option value="keep">保留原规则</option>
                <option value="minimal">{t('minimal')}</option>
                <option value="balanced">{t('balanced')}</option>
                <option value="comprehensive">{t('comprehensive')}</option>
                <option value="custom">{t('custom')}</option>
              </select>
              <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">在这里调整内置分类。原来单独添加的自定义规则会保留。</p>
              <div x-show="managedRulePreset === 'custom'">
                <RuleChoices t={t} model="managedSelectedRules" disabled="managedBusy || managedRowBusy" />
              </div>
            </div>
          </details>
          <div class="mt-3 flex flex-wrap gap-2">
            <button type="button" x-on:click="saveManagedSubscription()" x-bind:disabled="managedBusy || managedRowBusy || !managedSources.trim()" class={PRIMARY_BUTTON}>保存到原订阅</button>
            <button type="button" x-on:click="cancelManagedSubscriptionEdit()" x-bind:disabled="managedBusy || managedRowBusy" class="min-h-11 rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 disabled:opacity-50 dark:border-slate-600 dark:text-gray-200 dark:hover:bg-slate-800">取消编辑</button>
          </div>
        </div>
        <p x-cloak x-show="managedMessage" x-text="managedMessage" role="status" class="mt-3 text-sm text-gray-600 dark:text-gray-300"></p>
      </section>
      <form {...{'x-on:submit.prevent': 'submitForm'}} class="space-y-5 sm:space-y-6">

      {/* Input Section */}
      <div class={CARD}>
        {sourceBridgeEnabled && <SourcePicker target="new" />}
        <TextareaWithActions
          id="input"
          name="input"
          label={t('shareUrls')}
          labelPrefix={
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300" aria-hidden="true">
              <i class="fas fa-link text-sm"></i>
            </span>
          }
          model="input"
          rows={5}
          placeholder={t('urlPlaceholder')}
          required
          labelActionsWrapperClass="flex shrink-0 gap-2"
          labelActions={[
            {
              key: 'paste',
              icon: 'fas fa-paste',
              label: t('paste'),
              hideLabelOnMobile: true,
              className:
                'min-h-9 px-2.5 text-xs font-medium bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-950 hover:text-primary-800 dark:hover:text-primary-300 transition-colors flex items-center gap-1',
              title: t('paste'),
              attrs: {
                'x-on:click': "navigator.clipboard.readText().then(text => input = text).catch(() => {})"
              }
            },
            {
              key: 'clear',
              icon: 'fas fa-times',
              label: t('clear'),
              hideLabelOnMobile: true,
              className:
                'min-h-9 px-2.5 text-xs font-medium bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-700 dark:hover:text-red-400 transition-colors flex items-center gap-1',
              title: t('clear'),
              attrs: {
                'x-on:click': "input = ''",
                'x-show': 'input'
              }
            }
          ]}
        />
      </div>

      {/* Advanced Options Toggle */}
      <div 
        class={`${CARD} flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors`}
        x-on:click="showAdvanced = !showAdvanced"
        x-bind:aria-expanded="showAdvanced.toString()"
        aria-controls="advancedOptions"
        role="button"
        tabindex="0"
        {...{
          'x-on:keydown.enter.prevent': 'showAdvanced = !showAdvanced',
          'x-on:keydown.space.prevent': 'showAdvanced = !showAdvanced'
        }}
      >
        <div class="flex items-center gap-3">
          <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-sm text-primary-700 dark:bg-primary-950 dark:text-primary-300" aria-hidden="true">
            <i class="fas fa-sliders-h"></i>
          </div>
          <span class="font-semibold text-gray-900 dark:text-white">{t('advancedOptions')}</span>
        </div>
        <div 
          class="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 transition-transform duration-300" 
          x-bind:class="{'rotate-180': showAdvanced}"
        >
          <i class="fas fa-chevron-down"></i>
        </div>
      </div>

  {/* Advanced Options Content */ }
  <div id="advancedOptions" x-cloak x-show="showAdvanced" {...{'x-transition:enter': 'transition ease-out duration-300', 'x-transition:enter-start': 'opacity-0 transform -translate-y-4', 'x-transition:enter-end': 'opacity-100 transform translate-y-0', 'x-transition:leave': 'transition ease-in duration-200', 'x-transition:leave-start': 'opacity-100 transform translate-y-0', 'x-transition:leave-end': 'opacity-0 transform -translate-y-4'}} class="space-y-6">

    {/* Rule Selection */ }
    <details class={`${CARD} group`}>
      <summary class="flex cursor-pointer list-none flex-wrap items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white [&::-webkit-details-marker]:hidden">
        <i class="fas fa-filter text-gray-400" aria-hidden="true"></i>
        {t('ruleSelection')}
        <span class="ml-auto text-sm font-medium text-gray-500 dark:text-gray-300" x-text="window.APP_TRANSLATIONS.rulePresetNames[selectedPredefinedRule]"></span>
        <i class="fas fa-chevron-down text-xs text-gray-400 transition-transform group-open:rotate-180" aria-hidden="true"></i>
      </summary>
      <div class="mt-4 flex justify-end">
        <select aria-label={t('ruleSelection')} x-model="selectedPredefinedRule" x-on:change="applyPredefinedRule()" class="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-700 focus:border-transparent focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-200">
          <option value="minimal">{t('minimal')}</option>
          <option value="balanced">{t('balanced')}</option>
          <option value="comprehensive">{t('comprehensive')}</option>
          <option value="custom">{t('custom')}</option>
        </select>
      </div>

      <RuleChoices t={t} model="selectedRules" onChange="selectedPredefinedRule = 'custom'" />
    </details>

  {/* Custom Rules Component */ }
  <CustomRules t={t} />

    {/* General Options */ }
    <div class={CARD}>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <i class="fas fa-cog text-gray-400"></i>
              {t('generalSettings')}
            </h3>
            
            <div class="space-y-4">
              <label class="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/30 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors cursor-pointer">
                <span class="font-medium text-gray-700 dark:text-gray-300">{t('groupByCountry')}</span>
                <div class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" x-model="groupByCountry" class="sr-only peer" />
                  <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
                </div>
              </label>

              <label class="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/30 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors cursor-pointer">
                <span class="font-medium text-gray-700 dark:text-gray-300">{t('includeAutoSelect')}</span>
                <div class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" x-model="includeAutoSelect" class="sr-only peer" />
                  <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
                </div>
              </label>

              <label class="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/30 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors cursor-pointer">
                <span class="font-medium text-gray-700 dark:text-gray-300">{t('enableClashUI')}</span>
                <div class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" x-model="enableClashUI" class="sr-only peer" />
                  <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
                </div>
              </label>

              <div
                x-show="enableClashUI"
                {...{
                  'x-transition:enter': 'transition ease-out duration-200',
                  'x-transition:enter-start': 'opacity-0 transform -translate-y-2',
                  'x-transition:enter-end': 'opacity-100 transform translate-y-0',
                  'x-transition:leave': 'transition ease-in duration-150',
                  'x-transition:leave-start': 'opacity-100 transform translate-y-0',
                  'x-transition:leave-end': 'opacity-0 transform -translate-y-2'
                }}
                class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2"
              >
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('externalController')}</label>
                  <input type="text" x-model="externalController" class="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent" placeholder={t('externalControllerPlaceholder')} />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('externalUiDownloadUrl')}</label>
                  <input type="text" x-model="externalUiDownloadUrl" class="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent" placeholder={t('externalUiDownloadUrlPlaceholder')} />
                </div>
              </div>
          </div>
          </div>

  {/* Subconverter External Config */}
  <div class={CARD}>
    <h3 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-2">
      <i class="fas fa-file-export text-gray-400"></i>
      {t('subconverterConfigTitle')}
    </h3>
    <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">{t('subconverterConfigDesc')}</p>
    <div class="px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
      <p class="font-mono text-sm text-gray-600 dark:text-gray-400 break-all" x-text="getSubconverterUrl()"></p>
    </div>
    <div class="mt-3 flex justify-end">
      <button
        type="button"
        x-on:click="copySubconverterUrl()"
        class="px-4 py-2 rounded-lg transition-colors font-medium text-sm flex items-center gap-2"
        x-bind:class="subconverterCopied ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'"
      >
        <i class="fas" x-bind:class="subconverterCopied ? 'fa-check' : 'fa-copy'"></i>
        <span x-text={`subconverterCopied ? '${t('copiedSubconverterUrl')}' : '${t('copySubconverterUrl')}'`}></span>
      </button>
    </div>
  </div>

  {/* Base Config */ }
  <div class={CARD}>
            <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <i class="fas fa-file-code text-gray-400"></i>
                {t('baseConfigSettings')}
              </h3>
              <select x-model="configType" class="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-primary-500 focus:border-transparent">
                <option value="singbox">SingBox (JSON)</option>
                <option value="clash">Clash (YAML)</option>
                <option value="surge">Surge (JSON/INI)</option>
              </select>
          </div>
            
            <ValidatedTextarea
              id="configEditor"
              name="configEditor"
              model="configEditor"
              rows={5}
              placeholder="Paste your custom config here..."
              variant="mono"
              containerClass="mt-0 group"
              labelWrapperClass="flex items-center justify-end mb-2"
              labelActionsWrapperClass="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              pasteLabel={t('paste')}
              clearLabel={t('clear')}
              validation={{
                button: {
                  key: 'validate-config',
                  label: t('validateConfig'),
                  className:
                    'px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors flex items-center gap-2',
                  attrs: {
                    'x-on:click': 'validateBaseConfig()'
                  }
                },
                success: {
                  show: "configValidationState === 'success'",
                  textExpr: 'configValidationMessage'
                },
                error: {
                  show: "configValidationState === 'error'",
                  textExpr: 'configValidationMessage'
                }
              }}
              inlineActionsWrapperClass="absolute bottom-4 right-4 flex gap-2"
              preserveLabelSpace={false}
            />
            
            <div class="flex justify-end gap-3 mt-4">
              <button 
                type="button" 
                x-on:click="saveBaseConfig()" 
                x-bind:disabled="savingConfig"
                class="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium text-sm disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <i class="fas" x-bind:class="savingConfig ? 'fa-spinner fa-spin' : 'fa-save'"></i>
                <span x-text="savingConfig ? savingConfigText : saveConfigText">{t('saveConfig')}</span>
              </button>
              <button type="button" x-on:click="clearBaseConfig()" class="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors font-medium text-sm" >
  { t('clearConfig') }
              </button>
          </div>
          </div >

  {/* User Agent */ }
  <div class={CARD}>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <i class="fas fa-user-secret text-gray-400"></i>
              {t('UASettings')}
            </h3>
            <input 
              type="text" 
              x-model="customUA" 
              class="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
              placeholder="curl/7.74.0" 
            />
          </div>
        </div>

  {/* Action Buttons */ }
  <div class="flex flex-col sm:flex-row gap-4">
          <button 
            type="submit" 
            class="flex-1 py-3.5 px-6 bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-700 hover:to-primary-600 text-white rounded-xl font-bold shadow-lg shadow-primary-500/30 hover:shadow-primary-500/40 transform hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2"
            x-bind:disabled="loading"
          >
            <i class="fas fa-sync-alt" x-bind:class="loading ? 'fa-spinner fa-spin' : 'fa-sync-alt'"></i>
            <span x-text="loading ? processingText : convertText">{t('convert')}</span>
          </button>

  <button
    type="button" 
            x-on:click="clearAll()"
class="px-6 py-3.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-200 flex items-center justify-center gap-2 shadow-sm"
  >
  <i class="fas fa-trash-alt"></i>
{ t('clear') }
          </button>
        </div>
      </form>

  {/* Results Section */ }
  <div x-cloak x-show="generatedLinks" x-data="{ copied: null }" {...{'x-transition:enter': 'transition ease-out duration-500', 'x-transition:enter-start': 'opacity-0 transform translate-y-8', 'x-transition:enter-end': 'opacity-100 transform translate-y-0'}} class="mt-12">
    <div class={`${CARD} mb-6`}>
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h2 class="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <span class="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex items-center justify-center">
            <i class="fas fa-link text-sm"></i>
          </span>
          {t('subscriptionLinks')}
        </h2>
      </div>

      <div class="mt-6 space-y-4">
        {LINK_FIELDS.map((field) => (
          <div class="relative group" key={field.key}>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t(field.labelKey)}
            </label>
            <div class="flex gap-2">
              <input
                type="text"
                readonly
                x-bind:value={`shortenedLinks ? shortenedLinks?.${field.key} : generatedLinks?.${field.key}`}
                class="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:border-transparent transition-all duration-200 font-mono text-sm"
                x-bind:class="shortenedLinks ? 'text-primary-600 dark:text-primary-400 font-semibold focus:ring-primary-500' : 'text-gray-600 dark:text-gray-400 focus:ring-green-500'"
              />
              <button
                type="button"
                x-on:click={`navigator.clipboard.writeText((shortenedLinks || generatedLinks)?.${field.key}); copied = '${field.key}'; setTimeout(() => copied = null, 2000)`}
                class="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
                x-bind:class={`{
                  'hover:bg-green-100 dark:hover:bg-green-900/30 hover:text-green-600 dark:hover:text-green-400': !shortenedLinks,
                  'hover:bg-primary-100 dark:hover:bg-primary-900/30 hover:text-primary-600 dark:hover:text-primary-400': shortenedLinks,
                  'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400': !shortenedLinks && copied === '${field.key}',
                  'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400': shortenedLinks && copied === '${field.key}'
                }`}
              >
                <i class="fas" x-bind:class={`copied === '${field.key}' ? 'fa-check' : 'fa-copy'`}></i>
              </button>
              <button type="button" x-on:click={`showQr('${field.key}')`} class="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-primary-100 hover:text-primary-600 transition-colors" title="显示二维码"><i class="fas fa-qrcode"></i></button>
            </div>
          </div>
        ))}
      </div>

      <div x-cloak x-show="qrCodeUrl" class="mt-6 rounded-xl border border-primary-100 bg-primary-50 p-5 text-center dark:border-primary-900/40 dark:bg-primary-900/10">
        <p class="mb-3 text-sm font-medium text-gray-700 dark:text-gray-200">扫码导入 <span x-text="qrCodeLabel"></span> 订阅</p>
        <div id="subscription-qr-code" class="inline-flex rounded-lg bg-white p-3 shadow-sm"></div>
        <p class="mt-3 text-xs text-gray-500 dark:text-gray-400">请妥善保管二维码和订阅链接，持有链接即可订阅。</p>
      </div>

      {/* Shortening Controls */}
      <div class="mt-6">
        <div class="flex flex-col items-center gap-3">
          <div class="w-full max-w-md">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 text-center">
              {t('customShortCode')} <span class="text-gray-400">({t('optional')})</span>
            </label>
            <input
              type="text"
              x-model="customShortCode"
              placeholder={t('customShortCodePlaceholder')}
              class="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 text-center"
            />
            <label class="mt-3 block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 text-center">订阅备注名（可选）</label>
            <input type="text" x-model="newSubscriptionRemark" maxlength="80" placeholder="例如 Alex 的手机" class="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center" />
          </div>
        </div>
        <div class="flex justify-center mt-4">
          <button
            type="button"
            x-on:click="shortenedLinks ? shortenedLinks = null : shortenLinks()"
            x-bind:disabled="!shortenedLinks && shortening"
            class="px-6 py-3 rounded-xl font-semibold transition-all duration-200 flex items-center gap-2 shadow-lg"
            x-bind:class="shortenedLinks
              ? 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm'
              : 'bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-700 hover:to-primary-600 text-white shadow-primary-500/30 hover:shadow-primary-500/40 disabled:opacity-50 disabled:cursor-not-allowed'"
          >
            <i
              class="fas"
              x-bind:class="shortenedLinks ? 'fa-expand-alt' : (shortening ? 'fa-spinner fa-spin' : 'fa-compress-alt')"
            ></i>
            <span
              x-text="shortenedLinks ? showFullLinksText : (shortening ? shorteningText : shortenLinksText)"
            ></span>
          </button>
        </div>
      </div>
    </div>
  </div>

  <script dangerouslySetInnerHTML={{ __html: scriptContent }} />
    </div>
  );
};
