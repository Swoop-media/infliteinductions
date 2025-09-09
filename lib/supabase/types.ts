// Explicit Database interface to prevent infinite type instantiation
export interface Database {
  public: {
    Tables: {
      quiz_questions: {
        Row: {
          id: string;
          order_index?: number;
          quiz_id?: string;
          module_id?: string;
          course_id?: string;
          [key: string]: any;
        };
        Insert: {
          [key: string]: any;
        };
        Update: {
          [key: string]: any;
        };
      };
      quizzes: {
        Row: {
          id: string;
          [key: string]: any;
        };
        Insert: {
          [key: string]: any;
        };
        Update: {
          [key: string]: any;
        };
      };
      quiz_options: {
        Row: {
          id: string;
          question_id: string;
          order_index?: number;
          [key: string]: any;
        };
        Insert: {
          [key: string]: any;
        };
        Update: {
          [key: string]: any;
        };
      };
      course_modules: {
        Row: {
          id: string;
          course_id: string;
          type: string;
          title?: string;
          [key: string]: any;
        };
        Insert: {
          [key: string]: any;
        };
        Update: {
          [key: string]: any;
        };
      };
      courses: {
        Row: {
          id: string;
          created_by?: string;
          [key: string]: any;
        };
        Insert: {
          [key: string]: any;
        };
        Update: {
          [key: string]: any;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
