"use client";

import { useState } from "react";
import { ArrowDown, ArrowRight, Waves } from "lucide-react";
import s from "./ScrollOnboarding.module.css";

const readings = [
  { label: "Low risk", color: "#426c39", background: "#edf4e7", title: "A lower predicted bacteria risk.", text: "The model estimates a lower chance of bacteria exceeding water-quality standards. Check your beach’s details and official advisories before heading in." },
  { label: "Moderate risk", color: "#806316", background: "#f8f0d7", title: "A reason to take a closer look.", text: "The model estimates an elevated chance of bacteria exceeding water-quality standards. Open your beach to understand the prediction and check official advisories." },
  { label: "High risk", color: "#a63d36", background: "#fbece7", title: "Reconsider getting in the water.", text: "The model estimates greater than a 50% chance that bacteria exceeds water-quality standards. Check official advisories and consider another beach or another day." },
];

export default function ScrollOnboarding() {
  const [selected, setSelected] = useState(0);
  const reading = readings[selected];
  return <section id="read-the-water" className={s.guide} aria-labelledby="water-guide-title">
    <div className={s.introduction}>
      <h2 id="water-guide-title">Water Quality is Invisible</h2>
      <p>You can’t see bacteria. Neptune turns environmental conditions into a daily prediction you can check before you go.</p>
      <a href="#behind-the-forecast">How does the forecast work? <ArrowDown size={15} aria-hidden="true" /></a>
    </div>
    <div className={s.explorer}>
      <p className={s.kicker}>ONE INDEX. THREE SIGNALS.</p>
      <p className={s.try}>Tap a color to learn what it means.</p>
      <div className={s.choices} role="group" aria-label="Explore risk categories">{readings.map((item, index) => <button key={item.label} aria-pressed={selected === index} onClick={() => setSelected(index)} style={{ color: item.color, background: selected === index ? item.background : undefined }}><i style={{ background: item.color }} />{item.label}</button>)}</div>
      <div className={s.reading} aria-live="polite" style={{ background: reading.background, color: reading.color }}><Waves size={26} aria-hidden="true" /><h3>{reading.title}</h3><p>{reading.text}</p></div>
      <p className={s.note}>A forecast is an estimate, not a current lab result or a guarantee of safe swimming.</p>
    </div>
    <a className={s.next} href="#sandbox-pro"><span><strong>Today’s a start. What about your next beach day?</strong></span><ArrowRight size={22} aria-hidden="true" /></a>
  </section>;
}
