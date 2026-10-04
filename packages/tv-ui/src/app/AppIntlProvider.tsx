import React, { ReactNode } from "react";
import { IntlProvider, CustomFormats } from "react-intl";
import englishMessages from "stash-ui/dist/src/locales/en-GB.json";
import flattenMessages from "stash-ui/dist/src/utils/flattenMessages";

// We only support English for now but we have to load IntlProvider so we don't break components imported from
// stash-ui that rely on it.
const defaultLocale = "en-GB";
const messages = flattenMessages((englishMessages as unknown) as Record<string, string>);
const formats: CustomFormats = {
  date: {
    long: { year: "numeric", month: "long", day: "numeric" },
  },
};

/** The react-intl context Stash's components need: its English messages, and the formats it uses */
export function AppIntlProvider({ locale = defaultLocale, children }: { locale?: string, children: ReactNode }) {
  return (
    <IntlProvider locale={locale} messages={messages} formats={formats}>
      {children}
    </IntlProvider>
  );
}
