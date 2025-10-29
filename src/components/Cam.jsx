import React, { useEffect, useRef } from "react";
import { Pose } from "@mediapipe/pose";
import { Hands } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";

export default function StrumHand() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // === Preload pick image ===
  const pickImage = new Image();
  pickImage.src = "/aerostrum-browser/images/pick.webp";
  const guitarImage = new Image();
  guitarImage.src = "/aerostrum-browser/images/guitar3.png";
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    // === Pose ===
    const pose = new Pose({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });
    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    // === Hands ===
    const hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });
    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5,
    });

    // === Load chord sounds ===
    const chordFolder = "chords";
    let currentChord = null;
    let currentMode = null;
    const numStrings = 6;
    let stringSounds = Array(numStrings).fill(null);
    const activeAudio = Array(numStrings).fill(null);

    async function loadChordSounds(chordName, mode = "acoustic") {
      stringSounds = [];
      for (let i = 0; i < numStrings; i++) {
        const path = `/aerostrum-browser/${chordFolder}/${mode}/${chordName}/string${i + 1}.wav`;
        stringSounds.push(new Audio(path));
      }
      currentChord = chordName;
      currentMode = mode;
    }
    loadChordSounds("C", "acoustic");

    // === Detect chord gesture ===
    function detectHandGesture(handLandmarks) {
      const thumbTip = handLandmarks[4];
      const thumbIp = handLandmarks[3];
      const thumbMcp = handLandmarks[2];
      const tips = [8, 12, 16, 20];
      const pips = [6, 10, 14, 18];
      const thumbOpen = thumbTip.x < thumbIp.x && thumbIp.x < thumbMcp.x;
      const yTips = tips.map((i) => handLandmarks[i].y);
      const yPips = pips.map((i) => handLandmarks[i].y);
      const fingersUp = yTips.map((y, i) => y < yPips[i]);
      const pattern = [thumbOpen, ...fingersUp];

      const acousticPatterns = {
        "false,true,false,false,false": ["C", "acoustic"],
        "false,true,true,false,false": ["Dm", "acoustic"],
        "false,true,true,true,false": ["Em", "acoustic"],
        "false,true,true,true,true": ["F", "acoustic"],
        "false,false,false,false,true": ["G", "acoustic"],
        "false,false,false,true,true": ["Am", "acoustic"],
        "false,false,true,true,true": ["Bdim", "acoustic"],
      };
      const distortedPatterns = {
        "true,true,false,false,false": ["C", "distorted"],
        "true,true,true,false,false": ["Dm", "distorted"],
        "true,true,true,true,false": ["Em", "distorted"],
        "true,true,true,true,true": ["F", "distorted"],
        "true,false,false,false,true": ["G", "distorted"],
        "true,false,false,true,true": ["Am", "distorted"],
        "true,false,true,true,true": ["Bdim", "distorted"],
      };
      const key = pattern.join(",");
      if (key in acousticPatterns) return acousticPatterns[key];
      if (key in distortedPatterns) return distortedPatterns[key];
      return [null, null];
    }

    // === State ===
    let latestPoseResults = null;
    let latestHandResults = null;
    const baseSpacing = 25;
    const stringLabels = ["E", "A", "D", "G", "B", "E"];
    const stringColors = Array(numStrings).fill([200, 200, 200]);
    const stringHitTime = Array(numStrings).fill(0);
    const colorDuration = 10;
    let prevStrumY = null;
    let frameCount = 0;

    // === Draw function ===
    const drawCombined = (poseResults, handResults) => {
      if (!poseResults && !handResults) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const image = poseResults?.image || handResults?.image;
      if (image) {
        ctx.save();
        ctx.scale(-1, 1);
        ctx.translate(-canvas.width, 0);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      }

      // Draw strings
      const offsetX = 80;
      const offsetY = 80;

      // Default static position
      let startX = canvas.width / 2 - 100 + offsetX;
      let endX = canvas.width / 2 + 100 + offsetX;
      let startY = canvas.height / 2 - (numStrings / 2) * baseSpacing + offsetY;
      let spacingScaled = baseSpacing;

      if (handResults?.multiHandLandmarks?.length > 0) {
        const hand = handResults.multiHandLandmarks[0];

        const xs = hand.map((lm) => lm.x * canvas.width / 2);
        const ys = hand.map((lm) => lm.y * canvas.height);

        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        // === Scale based on hand height ===
        const handHeight = maxY - minY;
        const minHandHeight = 50;
        const maxHandHeight = 300;
        let scale = (handHeight - minHandHeight) / (maxHandHeight - minHandHeight);
        scale = Math.max(0.21, Math.min(3.0, scale));

        // Apply scale
        const baseWidth = 1550;
        const width = baseWidth * scale;
        spacingScaled = baseSpacing * scale;
        const horizontalOffset = 200 * scale; // distance from hand to string

        // Position strings relative to hand
        startX = centerX + horizontalOffset;
        endX = startX + width;
        startY = centerY - (numStrings / 2) * spacingScaled;

        if (guitarImage.complete) {
          // Preserve original aspect ratio
          const originalWidth = guitarImage.width;
          const originalHeight = guitarImage.height;
          const aspectRatio = originalWidth / originalHeight;
        
          // Scale based on hand height
          const handHeight = maxY - minY;
          const minHandHeight = 50;
          const maxHandHeight = 300;
          let scale = (handHeight - minHandHeight) / (maxHandHeight - minHandHeight);
          scale = Math.max(0.21, Math.min(3.0, scale));
        
          // Guitar dimensions
          const baseGuitarHeight = 1700; // base height
          const guitarHeight = baseGuitarHeight * scale;
          const guitarWidth = guitarHeight * aspectRatio;
        
          // Offset guitar to the right of hand
          const guitarOffsetX = 750 * scale;
        
          const centerX = (minX + maxX) / 2;
          const centerY = (minY + maxY) / 2;
          const guitarX = centerX - guitarWidth / 2 + guitarOffsetX;
          const guitarY = centerY - guitarHeight / 2;
        
          // Draw guitar (flipped horizontally)
          ctx.save();
          ctx.translate(guitarX + guitarWidth / 2, 0); // pivot for flip
          ctx.scale(-1, 1);
          ctx.drawImage(guitarImage, -guitarWidth / 2, guitarY, guitarWidth, guitarHeight);
          ctx.restore();
        }
      } else {
          // Strings are off-screen by default
          startX = -1000;
          endX = -1000;
          startY = -1000;
      }

      for (let i = 0; i < numStrings; i++) {
        const y = startY + i * spacingScaled;
        if (frameCount - stringHitTime[i] > colorDuration) {
          stringColors[i] = [200, 200, 200];
        }
        const [r, g, b] = stringColors[i];
        const stringThickness = 6 - i;

        ctx.lineWidth = stringThickness + 2;
        ctx.strokeStyle = "black";
        ctx.beginPath();
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
        ctx.stroke();

        ctx.lineWidth = stringThickness;
        ctx.strokeStyle = `rgb(${r},${g},${b})`;
        ctx.beginPath();
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
        ctx.stroke();

        // ctx.font = "16px Arial Black";
        // ctx.lineWidth = 3;
        // ctx.strokeStyle = "black";
        // ctx.strokeText(stringLabels[i], startX - 20, y + 5);
        // ctx.fillStyle = "white";
        // ctx.fillText(stringLabels[i], startX - 20, y + 5);
      }

      // === Pose right wrist ===
      if (poseResults?.poseLandmarks) {
        const wrist = poseResults.poseLandmarks[20];
        const wristX = (1 - wrist.x) * canvas.width;
        const wristY = wrist.y * canvas.height;

        // Draw pick image
        if (pickImage.complete) {
          const pickSize = 50;
          ctx.save();
          ctx.translate(wristX, wristY);
          ctx.rotate(Math.PI / 8);
          ctx.drawImage(pickImage, -pickSize / 2, -pickSize / 2, pickSize, pickSize);
          ctx.restore();
        }

        // Strumming detection: check all strings between prevStrumY and current wristY
        const stringLeftX = startX;
        const stringRightX = endX;

        // Only trigger if wrist is over the string area horizontally
        if (wristX >= stringLeftX && wristX <= stringRightX) {
          for (let i = 0; i < numStrings; i++) {
            const y = startY + i * spacingScaled;
            // Check if the string is between previous and current wrist positions
            if (
              (prevStrumY !== null &&
                ((prevStrumY <= y && wristY >= y) || (prevStrumY >= y && wristY <= y))) ||
              (prevStrumY === null && wristY >= y && wristY <= y)
            ) {
              // Trigger string
              stringColors[i] =
                currentMode === "distorted" ? [255, 0, 0] : [0, 165, 255];
              stringHitTime[i] = frameCount;

              // Stop previous audio if still playing
              if (activeAudio[i]) {
                activeAudio[i].pause();
                activeAudio[i].currentTime = 0;
              }

              // Play string audio
              activeAudio[i] = stringSounds[i];
              activeAudio[i].currentTime = 0;
              activeAudio[i].play();
            }
          }
        }

        // Update previous wrist Y
        prevStrumY = wristY;
      }

      // === Hand detection + gesture box ===
      if (handResults?.multiHandLandmarks) {
        handResults.multiHandLandmarks.forEach((hand) => {
          const xs = hand.map((lm) => lm.x * canvas.width / 2);
          const ys = hand.map((lm) => lm.y * canvas.height);
          let minX = Math.min(...xs);
          let maxX = Math.max(...xs);
          let minY = Math.min(...ys);
          let maxY = Math.max(...ys);

          const padding = 20;
          minX -= padding;
          minY -= padding;
          maxX += padding;
          maxY += padding;

          const boxWidth = maxX - minX;
          const boxHeight = maxY - minY;

          const [gestureChord, gestureMode] = detectHandGesture(hand);
          if (
            gestureChord &&
            gestureMode &&
            (gestureChord !== currentChord || gestureMode !== currentMode)
          ) {
            loadChordSounds(gestureChord, gestureMode);
          }

          if (gestureChord && gestureMode) {
            const colorThemes = {
              distorted: {
                bright: "#ff3333",
                medium: "#cc1a1a",
                dark: "#b30000",
              },
              acoustic: {
                bright: "#33ff66",
                medium: "#1acc4d",
                dark: "#009933",
              },
            };
            const theme = colorThemes[gestureMode];
            const romanMap = {
              C: "I",
              Dm: "II",
              Em: "III",
              F: "IV",
              G: "V",
              Am: "VI",
              Bdim: "VII°",
            };
            const romanNumeral = romanMap[gestureChord] || "";

            ctx.lineWidth = 4;
            ctx.strokeStyle = "black";
            ctx.strokeRect(minX - 1, minY - 1, boxWidth + 2, boxHeight + 2);

            ctx.lineWidth = 2;
            ctx.strokeStyle = theme.medium;
            ctx.strokeRect(minX, minY, boxWidth, boxHeight);

            ctx.textAlign = "center";
            ctx.font = "28px Arial Black";
            ctx.lineWidth = 3;
            ctx.strokeStyle = "black";
            ctx.fillStyle = theme.bright;
            ctx.strokeText(gestureChord, minX + boxWidth / 2, minY - 35);
            ctx.fillText(gestureChord, minX + boxWidth / 2, minY - 35);

            ctx.font = "22px Arial Black";
            ctx.lineWidth = 2;
            ctx.strokeStyle = "black";
            ctx.fillStyle = theme.dark;
            ctx.strokeText(romanNumeral, minX + boxWidth / 2, minY - 10);
            ctx.fillText(romanNumeral, minX + boxWidth / 2, minY - 10);
          }
        });
      }

      frameCount++;
    };

    // === Results callbacks ===
    pose.onResults((res) => {
      latestPoseResults = res;
      drawCombined(latestPoseResults, latestHandResults);
    });

    hands.onResults((res) => {
      latestHandResults = res;
      drawCombined(latestPoseResults, latestHandResults);
    });

    // === Camera with mirrored left-half detection ===
    const camera = new Camera(video, {
      onFrame: async () => {
        await pose.send({ image: video });

        const offscreen = document.createElement("canvas");
        const ctxOff = offscreen.getContext("2d");
        const w = video.videoWidth;
        const h = video.videoHeight;
        const halfW = w / 2;
        offscreen.width = halfW;
        offscreen.height = h;

        ctxOff.save();
        ctxOff.scale(-1, 1);
        ctxOff.drawImage(video, -w, 0, w, h);
        ctxOff.restore();

        const cropped = document.createElement("canvas");
        cropped.width = halfW;
        cropped.height = h;
        const cctx = cropped.getContext("2d");
        cctx.drawImage(offscreen, 0, 0, halfW, h, 0, 0, halfW, h);

        await hands.send({ image: cropped });
      },
      width: 640,
      height: 480,
    });

    camera.start();

    return () => camera.stop();
  }, []);

  return (
    <div style={{ textAlign: "center" }}>
      <video ref={videoRef} style={{ display: "none" }} />
      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        style={{
          border: "2px solid black",
          width: "50vw",
          height: "37.5vw",
        }}
      />
    </div>
  );
}
