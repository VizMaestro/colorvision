import { useMemo, useState } from 'react';
import { useSettings } from '../popup/hooks';
import { getProfile, type CorrectionMode, type ProfileId } from '../engine/profiles';
import { correctColor } from '../engine/correction';
import { linearToByte } from '../engine/linear';
import type { Vec3 } from '../engine/matrix';
import { effectiveSeverity } from '../engine/correction';
import {
  comparisonPairs,
  estimateSeverity,
  matrixFor,
  modeTrial,
  pickMode,
  pickStrength,
  strengthTrials,
  suggestProfile,
  thresholdLevels,
  type Candidate,
  type ComparisonTrial,
  type Preference,
  type ThresholdAnswer,
} from './model';

type Step = 'intro' | 'threshold' | 'compare' | 'mode' | 'result';

const css = (c: Vec3) => `rgb(${linearToByte(c[0])} ${linearToByte(c[1])} ${linearToByte(c[2])})`;

function Pair({ a, b, label }: { a: string; b: string; label?: string }) {
  return (
    <div className="pair" role="img" aria-label={label}>
      <span style={{ background: a }} />
      <span style={{ background: b }} />
    </div>
  );
}

function severityWord(s: number): string {
  if (s < 0.35) return 'mild';
  if (s < 0.7) return 'moderate';
  return 'strong';
}

export function CalibrationApp() {
  const { settings, update } = useSettings();
  const [step, setStep] = useState<Step>('intro');
  const [severity, setSeverity] = useState(0.6);
  const [trialIdx, setTrialIdx] = useState(0);
  const [answers, setAnswers] = useState<Preference[]>([]);
  const [strength, setStrength] = useState(0.6);
  const [mode, setMode] = useState<CorrectionMode>('natural');
  const [saved, setSaved] = useState(false);
  const [adoptProfile, setAdoptProfile] = useState(false);

  const trials = useMemo(() => strengthTrials(), []);
  const profile = settings ? getProfile(settings.profile) : null;
  const family = profile?.family ?? 'deutan';
  const levels = useMemo(() => thresholdLevels(family), [family]);
  const pairs = useMemo(() => comparisonPairs(family), [family]);
  const [pickedLevel, setPickedLevel] = useState<number | null>(null);

  if (!settings || !profile) return <main className="wrap"><p>Loading…</p></main>;

  const profileId: ProfileId = settings.profile;
  const sevForMatrix = profile.anomalous ? severity : effectiveSeverity(profileId);
  const matrixOf = (c: Candidate) => matrixFor(profileId, sevForMatrix, c);

  const finishThreshold = (ans: ThresholdAnswer) => {
    setSeverity(estimateSeverity(family, ans));
    setStep('compare');
    setTrialIdx(0);
    setAnswers([]);
  };

  const answerCompare = (p: Preference) => {
    const next = [...answers, p];
    if (trialIdx + 1 < trials.length) {
      setAnswers(next);
      setTrialIdx(trialIdx + 1);
    } else {
      setStrength(pickStrength(trials, next));
      setStep('mode');
    }
  };

  const answerMode = (p: Preference) => {
    setMode(pickMode(p));
    setStep('result');
  };

  const Side = ({ cand, title }: { cand: Candidate; title: string }) => {
    const M = matrixOf(cand);
    return (
      <div className="side">
        <h3>{title}</h3>
        {pairs.map(([a, b], i) => (
          <Pair key={i} a={css(correctColor(M, a))} b={css(correctColor(M, b))} label={`${title}, pair ${i + 1}`} />
        ))}
      </div>
    );
  };

  const renderTrial = (t: ComparisonTrial, onAnswer: (p: Preference) => void, question: string) => (
    <>
      <p className="lead">{question}</p>
      <div className="sides">
        <Side cand={t.left} title="Left" />
        <Side cand={t.right} title="Right" />
      </div>
      <div className="actions">
        <button className="btn primary" onClick={() => onAnswer('left')}>Left is easier</button>
        <button className="btn primary" onClick={() => onAnswer('right')}>Right is easier</button>
        <button className="btn" onClick={() => onAnswer('same')}>No difference</button>
      </div>
    </>
  );

  const suggested = suggestProfile(family, severity);

  const save = () => {
    update({
      calibration: { family, severity, strength, mode, completedAt: Date.now() },
      strength,
      mode,
      enabled: true,
      ...(adoptProfile ? { profile: suggested } : {}),
    });
    setSaved(true);
  };

  return (
    <main className="wrap">
      <header>
        <h1>ColorVision calibration</h1>
        <p className="muted">
          Profile: <strong>{profile.label}</strong> · Step {['intro', 'threshold', 'compare', 'mode', 'result'].indexOf(step) + 1} of 5
        </p>
      </header>

      {step === 'intro' && (
        <section className="card panel">
          <h2>Tune ColorVision to your eyes</h2>
          <p>
            You will compare colors on this screen and tell us which is easier to tell apart. We use your answers to choose a correction strength
            and mode, and to estimate a relative severity for your selected profile.
          </p>
          <ul>
            <li><strong>This is not a diagnosis.</strong> It cannot replace a clinical test; see an eye-care professional for that.</li>
            <li>Your answers stay <strong>on this device</strong> (browser local storage). Nothing is sent anywhere.</li>
            <li>For best results: turn off night shift / True Tone, set screen brightness to a comfortable level, and avoid glare.</li>
          </ul>
          <p className="muted">Using a different profile? Pick it in the ColorVision popup first, then start again.</p>
          <div className="actions"><button className="btn primary" onClick={() => setStep('threshold')}>Start</button></div>
        </section>
      )}

      {step === 'threshold' && (
        <section className="card panel">
          <h2>How different must two colors be?</h2>
          <p>
            Each box below is split into a left and a right color. Going from 1 to 7 the difference grows. Choose the <strong>first</strong> box where
            you can clearly see two different colors.
          </p>
          <div className="ladder" role="radiogroup" aria-label="First box with two clearly different colors">
            {levels.map((l) => (
              <button
                key={l.index}
                type="button"
                role="radio"
                aria-checked={pickedLevel === l.index}
                className="ladder-item"
                onClick={() => setPickedLevel(l.index)}
              >
                <Pair a={css(l.a)} b={css(l.b)} label={`Box ${l.index + 1}`} />
                <span>{l.index + 1}</span>
              </button>
            ))}
          </div>
          <div className="actions">
            <button className="btn primary" disabled={pickedLevel === null} onClick={() => finishThreshold(pickedLevel as number)}>
              Continue
            </button>
            <button className="btn" onClick={() => finishThreshold('all')}>I see two colors in every box</button>
            <button className="btn" onClick={() => finishThreshold('none')}>I see one color in every box</button>
          </div>
        </section>
      )}

      {step === 'compare' && (
        <section className="card panel">
          <h2>Which is easier? ({trialIdx + 1} of {trials.length})</h2>
          {renderTrial(trials[trialIdx], answerCompare, 'Look at the three boxes on each side. On which side is it easier to see two different colors in each box?')}
          <progress max={trials.length} value={trialIdx} aria-label="Progress" />
        </section>
      )}

      {step === 'mode' && (
        <section className="card panel">
          <h2>Natural or enhanced?</h2>
          {renderTrial(modeTrial(strength), answerMode, 'Left keeps colors closer to the original; right separates them more strongly. Which do you prefer?')}
        </section>
      )}

      {step === 'result' && (
        <section className="card panel">
          <h2>Your settings</h2>
          <dl className="result">
            <dt>Relative severity</dt>
            <dd>{severityWord(severity)} <span className="muted">({Math.round(severity * 100)} on an internal 0–100 scale)</span></dd>
            <dt>Intensity</dt>
            <dd>{Math.round(strength * 100)}%</dd>
            <dt>Mode</dt>
            <dd>{mode === 'enhanced' ? 'Enhanced' : 'Natural'}</dd>
          </dl>
          {suggested !== settings.profile && (
            <label className="check">
              <input type="checkbox" checked={adoptProfile} onChange={(e) => setAdoptProfile(e.target.checked)} />
              <span>
                Your answers resemble the <strong>{getProfile(suggested).label}</strong> setting more than {profile.label}. Switch the profile
                (display setting only, not a diagnosis).
              </span>
            </label>
          )}
          <p className="muted">
            The severity value is a relative scale internal to ColorVision, not a clinical measurement. Results can vary with your screen and
            lighting; you can recalibrate any time.
          </p>
          <div className="actions">
            <button className="btn primary" onClick={save} disabled={saved}>{saved ? 'Saved and applied' : 'Save and apply'}</button>
            <button className="btn" onClick={() => { setStep('intro'); setSaved(false); setPickedLevel(null); }}>Start over</button>
          </div>
          {saved && <p role="status" className="ok">Saved. Reload open tabs if they do not update.</p>}
        </section>
      )}
    </main>
  );
}
