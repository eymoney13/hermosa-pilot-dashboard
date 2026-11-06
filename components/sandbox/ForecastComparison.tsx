import { Clock3, Waves } from "lucide-react";
import s from "./ForecastComparison.module.css";

export default function ForecastComparison() {
  return <section className={s.comparison} aria-labelledby="forecast-comparison-title">
    <p className={s.eyebrow}>Forecast vs traditional system</p>
    <h2 id="forecast-comparison-title">Water quality changes faster<br />than lab results arrive.</h2>
    <article className={`${s.card} ${s.forecast}`}>
      <p className={s.label}><Waves size={14} aria-hidden="true" /> The Neptune forecast</p>
      <h3>Ocean + air + predictive model<br /><span>Daily forecast for today and the next 3 days.</span></h3>
      <ol className={s.steps} aria-label="Neptune forecast process">
        <li><strong>Ocean + weather</strong><span>Environmental conditions</span></li>
        <li><strong>Neptune model</strong><span>Predicts bacteria risk</span></li>
        <li><strong>Neptune forecast</strong><span>Check before you go</span></li>
      </ol>
      <p className={s.description}>Neptune turns environmental conditions in the ocean and the air into a real-time prediction of bacteria risk at your beach.</p>
      <p className={s.tagline}>Water quality. Predicted like the weather.</p>
    </article>
    <article className={`${s.card} ${s.traditional}`}>
      <p className={s.label}><Clock3 size={14} aria-hidden="true" /> Traditional culture-based reporting</p>
      <h3>Results posted days after sampling.<br /><span>A rearview mirror.</span></h3>
      <ol className={s.steps} aria-label="Traditional reporting process">
        <li><strong>Collect sample</strong><span>Water at that moment</span></li>
        <li><strong>Analyze in a lab</strong><span>18–48 hours*</span></li>
        <li><strong>Publish result</strong><span>Conditions may have changed</span></li>
      </ol>
      <p className={s.description}>Samples taken sparsely. Results describe the water quality when it was sampled, not what it is right now.</p>
    </article>
    <p className={s.footnote}>*Culture-based methods can take 18–48 hours to produce results. Some programs use faster methods. <a href="https://www.epa.gov/sites/production/files/2014-07/documents/beach-guidance-final-2014.pdf" target="_blank" rel="noopener noreferrer">Source: EPA.</a> Neptune forecasts complement water testing. Always follow official beach advisories.</p>
  </section>;
}
