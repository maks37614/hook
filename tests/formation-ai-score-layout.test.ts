import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAISetupScore } from '../server/geminiService';

const source = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const ui = source('../src/components/FormationDetailsModal.tsx');
const server = source('../server.ts');
const gemini = source('../server/geminiService.ts');

const smart = source('../src/components/SmartAnalysisBlock.tsx');

test('restore AI + Quant and replace ONLY its two top ratings with the detected setup', () => {
  assert.match(ui, /<SmartAnalysisBlock coin=\{coin\} formation=\{formation\} klines=\{klines\} timeframe=\{timeframe\}/);
  assert.match(ui, /tradeSetup=\{tradeSetupPanel\} onCollapse=\{toggleSmartAnalysis\}/);
  assert.match(ui, /smartAnalysisCollapsed \? \(/);
  assert.match(ui, /onClick=\{toggleSmartAnalysis\}/);
  assert.match(ui, /readSmartAnalysisPanelCollapsed/);
  assert.match(ui, /saveSmartAnalysisPanelCollapsed/);
  assert.match(ui, /updateProfileData\(\{ smartAnalysisCollapsed: next \}\)/);
  assert.equal((smart.match(/\{tradeSetup\}/g) || []).length, 4,
    'detected setup is rendered once per branch, including loading and error');
  assert.equal((ui.match(/id="formation-trade-setup-card"/g) || []).length, 1,
    'Entry/TP/SL and Telegram form only one logical setup card');
  assert.match(smart, /РОЗУМНИЙ АНАЛІЗ/);
  assert.match(smart, /AI \+ Quant/);
  assert.doesNotMatch(smart, /Ринкова оцінка \(не сигнал входу\)/);
  assert.doesNotMatch(smart, /Автоматично згенероване резюме/);
  const start = smart.indexOf('      {/* Canonical detected setup:');
  const atr = smart.indexOf('      {/* Only ATR remains', start);
  assert.ok(start > 0 && atr > start, 'detected setup replaces top two ratings, followed by ATR');
  assert.match(smart.slice(start, atr), /\{tradeSetup\}/);
  assert.match(smart, /fetch\(`\/api\/market\/smart-analysis\?\$\{queryParams\.toString\(\)\}`/);
  assert.match(smart, /analysisAbortRef\.current\?\.abort\(\)/);
  for (const retained of ['ATR (14) / Волатильність', 'Аналіз Holders', 'Великі заявки',
    'Маркет-мейкер', 'Вразливість ринку', 'Контекст BTC', 'RSI, EMA, Об\'єми та Спред',
    'Стакан, POC та Ліквідність', 'Open Interest та Деривативи']) {
    assert.ok(smart.includes(retained), 'AI+Quant module missing: ' + retained);
  }
  assert.match(smart, /onClick=\{fetchAnalysis\}/);
  for (const label of ['Виявлена формація','Якість сетапу','Торгові рівні (Setup)',
    'Точка входу (Entry):','Ціль (Take Profit):','Стоп-лос (Stop Loss):',
    'Сповіщення в Telegram']) {
    assert.ok(ui.includes(label), 'preserve existing formation feature: '+label);
  }
  assert.match(ui, /onClick=\{\(\) => handleSetAlert\('entry'/);
  assert.match(ui, /onClick=\{handleSetAllAlerts\}/);
});

test('the quality score folds out all existing validation factors and their actual evidence', () => {
  assert.match(ui, /aria-expanded=\{!isReferencePreview && qualityExpanded\}/);
  assert.match(ui, /onClick=\{\(\) => setQualityExpanded\(expanded => !expanded\)\}/);
  assert.match(ui, /aria-controls=\{isReferencePreview \? undefined : 'formation-setup-quality-details'\}/);
  assert.match(ui, /\{!isReferencePreview && qualityExpanded && \(/);
  assert.match(ui, /Object\.entries\(formation\.validation\.confluence\.components\)/);
  assert.doesNotMatch(ui, /\.filter\(\(\[key\]\) => key !== 'density'\)/);
  assert.match(ui, /density: 'Щільність BID\/ASK'/);
  assert.match(ui, /item\.availability === 'pending' \? 'Очікує пробою'/);
  assert.match(ui, /Доступність додаткових показників/);
  assert.match(ui, /\{tr\(item\.evidence\)\}/);
  assert.match(ui, /formation\.validation\.confluence\.rawTotal/);
  assert.match(ui, /Детальний розподіл балів для цієї формації недоступний/);
  assert.match(ui, /formation\.validation\?\.confluence\?\.total \?\? formation\.confidence/);
  assert.match(ui, /isReferencePreview \? '—' :/);
});

test('removed standalone AI-score icon without altering Smart Analysis refresh', () => {
  assert.doesNotMatch(ui, /onClick=\{handleRequestAi\}/);
  assert.doesNotMatch(ui, /<Sparkles className=/);
  assert.doesNotMatch(ui, /fetch\('\/api\/ai\/setup-score'/);
  assert.doesNotMatch(ui, /Оцінка AI/);
  assert.doesNotMatch(ui, /AI: \$\{aiScore\}/);
  assert.match(smart, /<SmartAnalysisBlock|fetchAnalysis/);
  assert.match(smart, /fetch\(`\/api\/market\/smart-analysis\?\$\{queryParams\.toString\(\)\}`/);
  assert.match(smart, /analysisAbortRef\.current\?\.abort\(\)/);
  // The already deployed authenticated API may remain available for clients
  // but must not be invoked by this page or affect chart loading.
  assert.match(server, /app\.post\('\/api\/ai\/setup-score', requireUserAuth/);
  assert.match(gemini, /model: 'gemini-2\.5-flash'/);
});

test('AI numeric response parser accepts only independent integer /100 values', () => {
  assert.equal(parseAISetupScore('{"score":0}'),0);
  assert.equal(parseAISetupScore('{"score":79}'),79);
  assert.equal(parseAISetupScore('{"score":100}'),100);
  assert.equal(parseAISetupScore('```json\n{"score":63}\n```'),63);
  for (const raw of ['{"score":-1}', '{"score":101}', '{"score":99.5}',
    '{"score":"97"}', '{}', 'analysis unavailable', 'null', '[]']) {
    assert.throws(()=>parseAISetupScore(raw), 'must reject non-numeric/out-of-range results');
  }
});
