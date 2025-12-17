export interface BindingBase {
  name: string;
  array?: true;
}

export interface MCPConnectionBinding extends BindingBase {
  type: "mcp";
  /**
   * If not provided, will return a function that takes the integration id and return the binding implementation..
   */
  connection_id: string;
}

export interface MCPAppBinding extends BindingBase {
  type: "mcp";
  /**
   * The name of the integration to bind.
   */
  app_name?: string;
}
export interface ContractClause {
  id: string;
  price: string | number; // can be microdollar or dollars
  description?: string;
}

export interface Contract {
  body: string;
  clauses: ContractClause[];
}

export interface ContractBinding extends BindingBase {
  type: "contract";
  /**
   * The clauses of this contract
   */
  contract: Contract;
}

export type MCPBinding = MCPConnectionBinding | MCPAppBinding;

export type Binding = MCPBinding | ContractBinding;

export interface MigrationBase {
  tag: string;
}

export interface NewClassMigration extends MigrationBase {
  new_classes?: string[];
  new_sqlite_classes?: string[];
}

export interface DeletedClassMigration extends MigrationBase {
  deleted_classes: string[];
}

export interface RenamedClassMigration extends MigrationBase {
  renamed_classes: {
    from: string;
    to: string;
  }[];
}

export type Migration =
  | NewClassMigration
  | DeletedClassMigration
  | RenamedClassMigration;

export interface KVNamespace {
  binding: string;
  id: string;
}

export interface Triggers {
  crons: string[];
}

export interface Route {
  pattern: string;
  custom_domain?: boolean;
}

export interface WranglerConfig {
  name: string;
  main?: string;
  scope?: string;
  main_module?: string;
  routes?: Route[];
  compatibility_date?: string;
  compatibility_flags?: string[];
  vars?: Record<string, string>;
  kv_namespaces?: KVNamespace[];
  triggers?: Triggers;
  //
  ai?: {
    binding: string;
  };
  browser?: {
    binding: string;
  };
  durable_objects?: {
    bindings?: { name: string; class_name: string }[];
  };
  hyperdrive?: { binding: string; id: string; localConnectionString: string }[];
  d1_databases?: {
    database_name: string;
    database_id?: string;
    binding: string;
  }[];
  queues?: {
    consumers?: {
      queue: string;
      max_batch_timeout: number;
    }[];
    producers?: {
      queue: string;
      binding: string;
    }[];
  };
  workflows?: {
    name: string;
    binding: string;
    class_name?: string;
    script_name?: string;
  }[];
  migrations?: Migration[];
  assets?: {
    directory?: string;
    binding?: string;
    jwt?: string;
    not_found_handling?: "none" | "404-page" | "single-page-application";
    run_worker_first?: boolean;
  };
  keep_assets?: boolean;
  //
  deco?: {
    enable_workflows?: boolean;
    workspace?: string;
    local?: boolean;
    integration?: {
      friendlyName?: string;
      icon?: string;
      description?: string;
    };
    bindings?: Binding[];
  };
}
