export type DomainKey =
  | "body"
  | "builder"
  | "knowledge"
  | "academics"
  | "capital"
  | "relationships"
  | "adventure"
  | "recovery";

export type Domain = {
  key: DomainKey;
  name: string;
  icon: string;
  level: number;
  trend: "up" | "flat" | "down";
  focus: string;
};

export type Quest = {
  id: string;
  domain: DomainKey;
  title: string;
  progress: number;
  unit?: string;
  status: "active" | "done" | "at-risk";
};
