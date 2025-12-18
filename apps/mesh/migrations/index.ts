import { type Migration } from "kysely";
import * as migration001initialschema from "./001-initial-schema.ts";
import * as migration002organizationsettings from "./002-organization-settings.ts";
import * as migration003connectionschemaalign from "./003-connection-schema-align.ts";
import * as migration004removemodelsbinding from "./004-remove-models-binding.ts";
import * as migration005connectionconfiguration from "./005-connection-configuration.ts";
import * as migration006addviewstosettings from "./006-add-views-to-settings.ts";
import * as migration007monitoringlogs from "./007-monitoring-logs.ts";
import * as migration008eventbus from "./008-event-bus.ts";

const migrations = {
  "001-initial-schema": migration001initialschema,
  "002-organization-settings": migration002organizationsettings,
  "003-connection-schema-align": migration003connectionschemaalign,
  "004-remove-models-binding": migration004removemodelsbinding,
  "005-connection-configuration": migration005connectionconfiguration,
  "006-add-views-to-settings": migration006addviewstosettings,
  "007-monitoring-logs": migration007monitoringlogs,
  "008-event-bus": migration008eventbus,
} satisfies Record<string, Migration>;

export default migrations;
