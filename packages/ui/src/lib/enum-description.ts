import { translate, type Language } from "./i18n.js";

const descriptions = new Map<string, string>(
  Object.entries({
    simp: "A product manifest and knowledge-base homepage.",
    goal: "An outcome you want to achieve.",
    procedure: "Steps to follow to complete a task.",
    capability: "A feature or ability available in the system.",
    state: "A condition that can be checked or established.",
    constraint: "A rule or restriction that must be considered.",
    procedures: "Procedures that help achieve this goal.",
    requires: "Dependencies needed by this procedure or capability.",
    preconditions: "States that must hold before this procedure runs.",
    optional_preconditions: "States that may help but are not required.",
    produces: "States established by this procedure.",
    uses: "Capabilities used by this procedure.",
    constrained_by: "Rules or restrictions that apply to this node.",
    satisfied_by: "Procedures that can establish this state.",
    related: "Related nodes, including links in the document body.",
    choice_option: "A procedure offered as an alternative in a choice.",
    active: "Currently maintained and intended for use.",
    deprecated: "No longer recommended for new use.",
    blocking: "A constraint that must be satisfied to proceed.",
    warning: "A constraint to consider before proceeding.",
    error: "A validation problem that must be fixed.",
  }),
);

export function enumDescription(
  value: string,
  context?: "issue",
  language: Language = "en",
): string | undefined {
  const description =
    value === "warning" && context === "issue"
      ? "A potential problem that should be reviewed."
      : descriptions.get(value);
  return description ? translate(language, description) : undefined;
}
