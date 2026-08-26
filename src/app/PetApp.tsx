import { useEffect, useState } from "react";
import { EffectLayer } from "../effects/EffectLayer";
import { MotionDebugPanel } from "../components/MotionDebugPanel";
import { SettingsPanel } from "../components/SettingsPanel";
import { SleepZzz } from "../components/SleepZzz";
import { SpeechBubble } from "../components/SpeechBubble";
import { InteractionArea } from "../pet/InteractionArea";
import { PetRig } from "../pet/PetRig";
import { accessoryReactionFor } from "../pet/layeredMotion";
import { WARDROBE_CATALOG } from "../growth/wardrobe";
import { usePetController } from "./usePetController";

export function PetApp() {
  const controller = usePetController();
  const selectedAccessory = controller.selectedAccessoryId
    ? WARDROBE_CATALOG.find((item) => item.id === controller.selectedAccessoryId) ?? null
    : null;
  const accessoryReaction = accessoryReactionFor(
    controller.selectedAccessoryId,
    controller.motion,
  );
  const [debugOpen, setDebugOpen] = useState(
    () =>
      new URLSearchParams(window.location.search).has("debug") ||
      window.localStorage.getItem("kittypet-debug") === "1",
  );

  // 开发期动作调参面板：Ctrl+Shift+D
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.code === "KeyD") {
        event.preventDefault();
        setDebugOpen((open) => {
          const next = !open;
          if (next) {
            window.localStorage.setItem("kittypet-debug", "1");
          } else {
            window.localStorage.removeItem("kittypet-debug");
          }
          return next;
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, []);

  if (controller.fatal) {
    return (
      <div className="pet-fatal">
        <strong>桌宠初始化出错</strong>
        <pre>{controller.fatal}</pre>
      </div>
    );
  }

  return (
    <div
      className="pet-root"
      style={{
        transform: `scale(${controller.scale})`,
        transformOrigin: "top left",
      }}
    >
      <SpeechBubble
        dialogue={controller.bubble}
        followUp={controller.followUp}
      />

      {!controller.bubble && controller.behaviorThought && (
        <div className="behavior-thought" role="status">
          {controller.behaviorThought}
        </div>
      )}

      <SleepZzz motion={controller.motion} />

      <EffectLayer
        motion={controller.motion}
        effectEvent={controller.effectEvent}
        heartsActive={controller.hearts}
        accessoryReaction={accessoryReaction}
      />

      <InteractionArea
        disabled={controller.settingsOpen || debugOpen}
        accessoryHitRegion={
          selectedAccessory
            ? { id: selectedAccessory.id, ...selectedAccessory.hitArea }
            : null
        }
        onClick={controller.onPetClick}
        onDragStart={controller.onPetDragStart}
        onDragMotion={controller.onPetDragMotion}
        onDragEnd={controller.onPetDragEnd}
        onOpenSettings={controller.openSettings}
        onWheelZoom={controller.onWheelZoom}
        onHoldStart={controller.onHoldStart}
        onHoldEnd={controller.onHoldEnd}
      >
        <PetRig
          motion={controller.motion}
          zoom={controller.scale}
          accessoryId={controller.selectedAccessoryId}
          headpatReaction={controller.headpatReaction}
          edgePeekSide={controller.edgePeekSide}
          touchTarget={controller.touchTarget}
          dragMotion={controller.dragMotion}
          dragRelease={controller.dragRelease}
          microMotion={controller.animationPrefs.microMotion}
          microCueOverride={controller.behaviorMicroCue}
          onFinished={controller.onAnimationFinished}
          gazeFollow={
            controller.animationPrefs.gazeFollow &&
            !controller.settingsOpen &&
            (controller.behaviorGazeOverride ?? true)
          }
        />
      </InteractionArea>

      <SettingsPanel
        open={controller.settingsOpen}
        alwaysOnTop={controller.alwaysOnTop}
        dnd={controller.dnd}
        autostart={controller.autostart}
        autostartSupported={controller.autostartSupported}
        scale={controller.scale}
        animations={controller.animationPrefs}
        reminders={controller.reminderPrefs}
        onScaleChange={controller.onScaleChange}
        onClose={controller.closeSettings}
        onToggleAlwaysOnTop={controller.toggleAlwaysOnTop}
        onToggleDnd={controller.toggleDnd}
        onToggleAutostart={controller.toggleAutostart}
        onToggleAnimation={controller.toggleAnimation}
        onUpdateReminder={controller.updateReminder}
        onClearData={controller.clearData}
        onOpenNest={controller.openNest}
      />

      {debugOpen && (
        <MotionDebugPanel
          motion={controller.motion}
          onClose={() => setDebugOpen(false)}
        />
      )}
    </div>
  );
}
