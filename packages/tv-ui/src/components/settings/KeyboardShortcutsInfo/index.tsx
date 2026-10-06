import React from "react";
import { Modal } from "../../containers/Modal";
import { MarkdownPage } from "stash-ui/dist/src/components/Shared/MarkdownPage";
import { useConfigurationContext } from "stash-ui/dist/src/hooks/Config";
import { defaultRatingSystemOptions } from "stash-ui/dist/src/utils/rating";
import content from "./KeyboardShortcutsInfo.md?raw";
import { filterShortcutsForRatingSystem } from "./filterShortcutsForRatingSystem";
import "./KeyboardShortcutsInfo.css";

export const KeyboardShortcutsInfo: React.FC<{
  show: boolean;
  onHide: () => void;
}> = ({ show, onHide }) => {
  const { configuration: stashConfig } = useConfigurationContext();
  const ratingSystem = stashConfig?.ui?.ratingSystemOptions?.type ?? defaultRatingSystemOptions.type;
  // MarkdownPage only takes a URL to fetch, so hand it the filtered text as a data URL
  const pageUrl = `data:text/markdown;charset=utf-8,${encodeURIComponent(filterShortcutsForRatingSystem(content, ratingSystem))}`;

  return (
    <Modal
      show={show}
      onHide={onHide}
      className="KeyboardShortcutsInfo"
      aria-labelledby="KeyboardShortcutsInfo-title"
    >
      <Modal.Header closeButton>
        <Modal.Title id="KeyboardShortcutsInfo-title">Keyboard Shortcuts</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {/* MarkdownPage only fetches once, so remount it if the content changes */}
        <MarkdownPage key={pageUrl} page={pageUrl} />
      </Modal.Body>
    </Modal>
  );
}
