import React from "react";
import { defineField, Field, joinAsSentence, SceneInfoFieldProps } from "./shared";
import { getStashUrl } from "../../../../helpers/getStashOrigin";

function GroupsField({ scene }: SceneInfoFieldProps) {
  if (!scene.groups.length) return null;
  return <Field field={fieldDefinition} showLabel>
    {joinAsSentence(scene.groups.map(({ group }) => (
      <a href={getStashUrl(`/groups/${group.id}`)} target="_blank">
        {group.name}
      </a>
    )))}
  </Field>
}

export const fieldDefinition = defineField({ id: "groups", label: "Groups", component: GroupsField });
