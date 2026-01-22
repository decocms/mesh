import { type Migration } from "kysely";
import * as migration001initialschema from "./001-initial-schema.ts";
import * as migration002organizationsettings from "./002-organization-settings.ts";
import * as migration003connectionschemaalign from "./003-connection-schema-align.ts";
import * as migration004removemodelsbinding from "./004-remove-models-binding.ts";
import * as migration005connectionconfiguration from "./005-connection-configuration.ts";
import * as migration006addviewstosettings from "./006-add-views-to-settings.ts";
import * as migration007monitoringlogs from "./007-monitoring-logs.ts";
import * as migration008eventbus from "./008-event-bus.ts";
import * as migration009dropauditlogs from "./009-drop-audit-logs.ts";
import * as migration010gateways from "./010-gateways.ts";
import * as migration011gatewayicon from "./011-gateway-icon.ts";
import * as migration012gatewaytoolselectionmode from "./012-gateway-tool-selection-mode.ts";
import * as migration013monitoringuseragentgateway from "./013-monitoring-user-agent-gateway.ts";
import * as migration014gatewayresourcesprompts from "./014-gateway-resources-prompts.ts";
import * as migration015monitoringproperties from "./015-monitoring-properties.ts";
import * as migration016downstreamtokenclientinfo from "./016-downstream-token-client-info.ts";
import * as migration017downstreamtokenremoveuserid from "./017-downstream-token-remove-userid.ts";
import * as migration018dropgatewaytoolselectionstrategy from "./018-drop-gateway-tool-selection-strategy.ts";
import * as migration019removegatewayisdefault from "./019-remove-gateway-is-default.ts";
import * as migration020enabledplugins from "./020-enabled-plugins.ts";
import * as migration021threads from "./021-threads.ts";
import * as migration022renamegatewaytovirtualmcp from "./022-rename-gateway-to-virtual-mcp.ts";
import * as migration023optimizethreadindexes from "./023-optimize-thread-indexes.ts";

const migrations = {
  "001-initial-schema": migration001initialschema,
  "002-organization-settings": migration002organizationsettings,
  "003-connection-schema-align": migration003connectionschemaalign,
  "004-remove-models-binding": migration004removemodelsbinding,
  "005-connection-configuration": migration005connectionconfiguration,
  "006-add-views-to-settings": migration006addviewstosettings,
  "007-monitoring-logs": migration007monitoringlogs,
  "008-event-bus": migration008eventbus,
  "009-drop-audit-logs": migration009dropauditlogs,
  "010-gateways": migration010gateways,
  "011-gateway-icon": migration011gatewayicon,
  "012-gateway-tool-selection-mode": migration012gatewaytoolselectionmode,
  "013-monitoring-user-agent-gateway": migration013monitoringuseragentgateway,
  "014-gateway-resources-prompts": migration014gatewayresourcesprompts,
  "015-monitoring-properties": migration015monitoringproperties,
  "016-downstream-token-client-info": migration016downstreamtokenclientinfo,
  "017-downstream-token-remove-userid": migration017downstreamtokenremoveuserid,
  "018-drop-gateway-tool-selection-strategy":
    migration018dropgatewaytoolselectionstrategy,
  "019-remove-gateway-is-default": migration019removegatewayisdefault,
  "020-enabled-plugins": migration020enabledplugins,
  "021-threads": migration021threads,
  "022-rename-gateway-to-virtual-mcp": migration022renamegatewaytovirtualmcp,
  "023-optimize-thread-indexes": migration023optimizethreadindexes,
} satisfies Record<string, Migration>;

export default migrations;
