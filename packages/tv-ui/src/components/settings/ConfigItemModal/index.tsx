import React, { ReactNode } from "react";
import { Button } from "react-bootstrap";
import { FormikValues, useFormik } from "formik";
import type * as yup from "yup";
import cx from "classnames";
import { yupFormikValidate } from "stash-ui/dist/src/utils/yup";
import { Modal } from "../../containers/Modal";

type Props<Values extends FormikValues> = {
  className?: string;
  header: ReactNode;
  /** Whether the item is being added to its list or is already in it */
  operation: "add" | "edit";
  initialValues: Values;
  /** Validates the form and casts its values before they're passed to onSave */
  schema: yup.AnySchema;
  onClose: () => void;
  onSave: (values: Values) => void;
  children: (formik: ReturnType<typeof useFormik<Values>>) => ReactNode;
}

/** A modal for adding or editing an item in a list of config items, such as an action button or a channel */
export function ConfigItemModal<Values extends FormikValues>({
  className,
  header,
  operation,
  initialValues,
  schema,
  onClose,
  onSave,
  children,
}: Props<Values>) {
  const formik = useFormik<Values>({
    initialValues,
    enableReinitialize: true,
    validate: yupFormikValidate(schema),
    onSubmit: (values) => onSave(schema.cast(values)),
  });

  return (
    <Modal show onHide={() => onClose()} title="" className={cx("ConfigItemModal", className)}>
      <Modal.Header>
        {header}
      </Modal.Header>
      <Modal.Body>
        <div className="dialog-content">
          {children(formik)}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={() => onClose()}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => formik.submitForm()}>
          {operation === "add" ? "Add" : "Save"}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
