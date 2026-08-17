import { SettingsPanel } from "../components/SettingsPanel";
import { SpeechBubble } from "../components/SpeechBubble";
import { InteractionArea } from "../pet/InteractionArea";
import { SpriteAnimation } from "../pet/SpriteAnimation";
import { usePetController } from "./usePetController";

export function PetApp() {
  const controller = usePetController();

  if (controller.fatal) {
    return (
      <div className="pet-fatal">
        <strong>桌宠初始化出错</strong>
        <pre>{controller.fatal}</pre>
      </div>
    );
  }

  return (
    <div className="pet-root">
      <SpeechBubble
        dialogue={controller.bubble}
        followUp={controller.followUp}
      />

      <InteractionArea
        disabled={controller.settingsOpen}
        onClick={controller.onPetClick}
        onDragStart={controller.onPetDragStart}
        onDragEnd={controller.onPetDragEnd}
        onOpenSettings={controller.openSettings}
      >
        <SpriteAnimation
          config={controller.motionConfig}
          onFinished={controller.onAnimationFinished}
        />
      </InteractionArea>

      <SettingsPanel
        open={controller.settingsOpen}
        alwaysOnTop={controller.alwaysOnTop}
        dnd={controller.dnd}
        autostart={controller.autostart}
        autostartSupported={controller.autostartSupported}
        onClose={controller.closeSettings}
        onToggleAlwaysOnTop={controller.toggleAlwaysOnTop}
        onToggleDnd={controller.toggleDnd}
        onToggleAutostart={controller.toggleAutostart}
        onClearData={controller.clearData}
      />
    </div>
  );
}
