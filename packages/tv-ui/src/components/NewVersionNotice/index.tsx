import React, { useState } from "react";
import { Button, Toast } from "react-bootstrap";
import { ArrowClockwise } from "react-bootstrap-icons";
import { useNewVersionCheck } from "../../hooks/useNewVersionCheck";
import { reloadFromServer } from "../../helpers/reloadFromServer";
import "./NewVersionNotice.css";

/**
 * Tells the user when a new version of Stash TV has been installed in Stash, with a button to reload into it.
 *
 * @see docs/app-updates.md
 */
const NewVersionNotice = () => {
  const { newVersion, dismiss } = useNewVersionCheck();
  const [reloading, setReloading] = useState(false);

  if (!newVersion) return null;

  return (
    <Toast className="NewVersionNotice" onClose={dismiss} role="status">
      <Toast.Header closeButton={!reloading}>
        <strong className="mr-auto">Stash TV v{newVersion} is available</strong>
      </Toast.Header>
      <Toast.Body className="body">
        <span>Reload to start using it.</span>
        <Button
          variant="primary"
          size="sm"
          disabled={reloading}
          onClick={() => {
            setReloading(true);
            reloadFromServer();
          }}
        >
          <ArrowClockwise /> Reload
        </Button>
      </Toast.Body>
    </Toast>
  );
};

export default NewVersionNotice;
