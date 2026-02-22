import React from "react";
import BootstrapModal, { type ModalProps } from "react-bootstrap/esm/Modal";
import BootstrapModalHeader from "react-bootstrap/esm/ModalHeader";
import BootstrapModalBody from "react-bootstrap/esm/ModalBody";
import BootstrapModalTitle from "react-bootstrap/esm/ModalTitle";
import BootstrapModalFooter from "react-bootstrap/esm/ModalFooter";
import BootstrapModalDialog from "react-bootstrap/esm/ModalDialog";
import { BsPrefixRefForwardingComponent } from 'react-bootstrap/esm/helpers';
import cx from "classnames";
import "./Modal.css";


export const Modal: BsPrefixRefForwardingComponent<'div', ModalProps> & {
    Body: typeof BootstrapModalBody;
    Header: typeof BootstrapModalHeader;
    Title: typeof BootstrapModalTitle;
    Footer: typeof BootstrapModalFooter;
    Dialog: typeof BootstrapModalDialog;
    TRANSITION_DURATION: number;
    BACKDROP_TRANSITION_DURATION: number;
} = (props) => {
  return <BootstrapModal
    {...props}
    className={cx("Modal", props.className)}
  />;
}

Modal.displayName = 'Modal';
Modal.Body = BootstrapModalBody;
Modal.Header = BootstrapModalHeader;
Modal.Title = BootstrapModalTitle;
Modal.Footer = BootstrapModalFooter;
Modal.Dialog = BootstrapModalDialog;
Modal.TRANSITION_DURATION = 300;
Modal.BACKDROP_TRANSITION_DURATION = 150;
