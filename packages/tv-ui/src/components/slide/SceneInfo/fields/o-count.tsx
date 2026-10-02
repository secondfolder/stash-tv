import React from "react";
import cx from "classnames";
import { useOCounter } from "../../../../hooks/useOCounter";
import { SidePanel } from "../../../action-buttons/ActionButtonBase";
import { OCounterControls, oCounterIcons } from "../../../OCounterControls";
import { choice, labelOption, OptionsOf } from "../field-options";
import { defineField, Field, labelProps, SceneInfoFieldProps } from "./shared";

const schema = {
  /** As a button marking an orgasm, like the o-counter action button, or as text */
  display: choice({ control: "O-counter button", text: "Text" }, "control", {
    label: "Show as",
    description: "The button marks an orgasm, like the O-counter action button, and shows even when the O-count is 0.",
  }),
  /** As text, labelled with the o-counter icon or the field's name */
  label: labelOption({ name: "O-count", icons: oCounterIcons, default: "icon", shown: options => options.display === "text" }),
};

type Props = SceneInfoFieldProps<OptionsOf<typeof schema>>;

function OCountField(props: Props) {
  const { scene, options: { display, label } } = props;
  if (display === "control") return <OCountControlField {...props} />;
  const oCount = scene.o_counter ?? 0;
  // With its icon, shown at 0 too, its outline saying so, as the play count's is
  if (!oCount && label === "text") return null;
  return <Field field={fieldDefinition} {...labelProps(schema.label, label, oCount > 0)}>{oCount}</Field>
}

/**
 * The o-count as a button marking an orgasm, as the o-counter action button does: clicked, it increments the o-count,
 * and its icon turns solid. Clicked again, it shows the controls for changing the o-count.
 */
function OCountControlField({ scene, preview }: Props) {
  const oCounter = useOCounter(scene);
  const state = oCounter.incremented ? "active" : "inactive";
  const Icon = oCounterIcons[state];
  const content = <>
    <Icon className="o-counter-icon" aria-hidden />
    {oCounter.count}
  </>;
  if (preview) return <Field field={fieldDefinition} className="o-count-control">{content}</Field>;
  return <Field field={fieldDefinition} className="o-count-control">
    <SidePanel content={<OCounterControls oCounter={oCounter} />} placement="top">
      {({ onClick, ref }) => <button
        type="button"
        ref={ref}
        className={cx("o-counter-button", `state-${state}`)}
        aria-label={oCounter.incremented ? "Change O-count" : "Mark Orgasm"}
        onClick={event => oCounter.incremented ? onClick(event) : oCounter.increment()}
      >
        {content}
      </button>}
    </SidePanel>
  </Field>
}

export const fieldDefinition = defineField({ id: "o-count", label: "O-count", component: OCountField, options: schema });
