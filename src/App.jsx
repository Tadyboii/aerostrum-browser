import React from "react";
import Cam from "./components/Cam";

export default function App() {
  const chords = ["C", "Dm", "Em", "F", "G", "Am", "Bdim"];

  return (
    <div className="main-container">
      {/* Left: Distorted */}
      <div className="side-panel left-panel">
        {chords.map((chord) => (
          <img
            key={chord}
            src={`/aerostrum-browser/handpositions/distorted/${chord}.png`}
            alt={`${chord} distorted`}
            className="chord-image"
          />
        ))}
      </div>

      {/* Center: Camera */}
      <div className="camera-panel">
        <Cam />
      </div>

      {/* Right: Acoustic */}
      <div className="side-panel right-panel">
        {chords.map((chord) => (
          <img
            key={chord}
            src={`/aerostrum-browser/handpositions/acoustic/${chord}.png`}
            alt={`${chord} acoustic`}
            className="chord-image"
          />
        ))}
      </div>
    </div>
  );
}