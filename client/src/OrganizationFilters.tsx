import { useState } from "react";

export type Organization = { section?: string | null; line?: string | null; group?: string | null };
export const organizationLabel = (person: Organization) => [person.section, person.line, person.group === "Normal Shift" ? person.group : person.group ? `Group ${person.group}` : null].filter(Boolean).join(" · ");
export function useOrganizationFilter<T extends Organization>(people: T[]) {
  const [section, setSection] = useState("");
  const [line, setLine] = useState("");
  const [group, setGroup] = useState("");
  const matches = (person: Organization) => (!section || person.section === section) && (!line || person.line === line) && (!group || person.group === group);
  const options = (field: keyof Organization, candidates: T[]) => [...new Set(candidates.map(person => person[field]).filter((value): value is string => !!value))].sort();
  const controls = <>
    <label>Section<select aria-label="Production section" value={section} onChange={event => { setSection(event.target.value); setLine(""); setGroup(""); }}><option value="">All sections</option>{options("section", people).map(value => <option key={value}>{value}</option>)}</select></label>
    {section !== "Roll Making" && <><label>Line / unit<select aria-label="Conversion line" value={line} onChange={event => { setLine(event.target.value); setGroup(""); }}><option value="">All lines / units</option>{options("line", people.filter(person => !section || person.section === section)).map(value => <option key={value}>{value}</option>)}</select></label>
    <label>Group<select aria-label="Conversion group" value={group} onChange={event => setGroup(event.target.value)}><option value="">All groups</option>{options("group", people.filter(person => (!section || person.section === section) && (!line || person.line === line))).map(value => <option key={value}>{value}</option>)}</select></label></>}
  </>;
  return { matches, controls, reset: () => { setSection(""); setLine(""); setGroup(""); }, active: !!(section || line || group) };
}
