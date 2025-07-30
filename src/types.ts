export type Results = {
  isHoax: boolean;
  link: string[];
  file: FileList;
  reason: string;
};

export interface ResponseAI {
  id: string;
  object: string;
  created_at: number;
  status: string;
  error: null;
  incomplete_details: null;
  instructions: null;
  max_output_tokens: null;
  model: string;
  output: Output[];
  parallel_tool_calls: boolean;
  previous_response_id: null;
  reasoning: Reasoning;
  store: boolean;
  temperature: number;
  text: Text;
  tool_choice: string;
  tools: any[];
  top_p: number;
  truncation: string;
  usage: Usage;
  user: null;
  metadata: Metadata;
}

export interface Metadata {}

export interface Output {
  type: string;
  id: string;
  status: string;
  role: string;
  content: Content[];
}

export interface Content {
  type: string;
  text: string;
  annotations: any[];
}

export interface Reasoning {
  effort: null;
  summary: null;
}

export interface Text {
  format: Format;
}

export interface Format {
  type: string;
}

export interface Usage {
  input_tokens: number;
  input_tokens_details: InputTokensDetails;
  output_tokens: number;
  output_tokens_details: OutputTokensDetails;
  total_tokens: number;
}

export interface InputTokensDetails {
  cached_tokens: number;
}

export interface OutputTokensDetails {
  reasoning_tokens: number;
}
