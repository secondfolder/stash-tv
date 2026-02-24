import React, { useEffect, useMemo } from "react";
import BootstrapModal, { type ModalProps } from "react-bootstrap/esm/Modal";
import BootstrapModalHeader from "react-bootstrap/esm/ModalHeader";
import BootstrapModalBody from "react-bootstrap/esm/ModalBody";
import BootstrapModalTitle from "react-bootstrap/esm/ModalTitle";
import BootstrapModalFooter from "react-bootstrap/esm/ModalFooter";
import BootstrapModalDialog from "react-bootstrap/esm/ModalDialog";
import { BsPrefixRefForwardingComponent } from 'react-bootstrap/esm/helpers';
import cx from "classnames";
import "./Modal.css";

const getViewportScrollbarWidth = () => window.innerWidth - (window.visualViewport?.width ?? document.documentElement.clientWidth);
let viewportScrollbarWidth = getViewportScrollbarWidth();

export const Modal: BsPrefixRefForwardingComponent<'div', ModalProps> & {
    Body: typeof BootstrapModalBody;
    Header: typeof BootstrapModalHeader;
    Title: typeof BootstrapModalTitle;
    Footer: typeof BootstrapModalFooter;
    Dialog: typeof BootstrapModalDialog;
    TRANSITION_DURATION: number;
    BACKDROP_TRANSITION_DURATION: number;
} = (props) => {
  // When opening the modal we set the html element to overflow hidden to hide the page scroll bar so we only have the
  // modal's scrollbar. But doing so will change where elements with position fixed (like the side drawer) are laid out.
  // To counter this we set what the the width of the scrollbar was and set it into a css custom var to allow fixed
  // positioned elements to account for that.
  // We use useMemo here even though it's a side effect because we it to run right before the next render not after
  useMemo(() => {
    // viewportScrollbarWidth was originally a ref for but for some weird reason (that doesn't seem like it should be
    // possible) useEffect was some how accessing the old value from it after it has been set in the useMemo
    viewportScrollbarWidth = getViewportScrollbarWidth()
  }, [props.show])
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const modalOpen = document.body.classList.contains('modal-open')
      const fixedRightPadding = modalOpen
        ? viewportScrollbarWidth
        : 0;
      document.documentElement.style.setProperty('--fixed-right-padding', `${fixedRightPadding}px`);
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });
    return () => observer.disconnect();
  }, [])

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
