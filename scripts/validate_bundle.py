#!/usr/bin/env python3
"""
Apigee Proxy Bundle Validator for apigee-llm-router
Validates XML syntax, file structure, policy references across proxies and targets,
unattached policies, target definitions, and resource bindings.
"""
import sys
import os
import xml.etree.ElementTree as ET

def validate():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.dirname(script_dir)
    apiproxy_dir = os.path.join(root_dir, "apiproxy")
    proxy_name = "apigee-llm-router"
    
    print(f"[*] Validating Apigee proxy bundle: {proxy_name}")
    print(f"[*] Proxy directory: {apiproxy_dir}")
    
    if not os.path.isdir(apiproxy_dir):
        print(f"[!] Error: {apiproxy_dir} does not exist.")
        sys.exit(1)
        
    errors = []

    # 1. Validate Root XML
    root_xml = os.path.join(apiproxy_dir, f"{proxy_name}.xml")
    if not os.path.exists(root_xml):
        errors.append(f"Missing root XML: {root_xml}")
        root_tree = None
    else:
        try:
            root_tree = ET.parse(root_xml)
            root_elem = root_tree.getroot()
            if root_elem.tag != "APIProxy":
                errors.append(f"Root tag must be <APIProxy>, got <{root_elem.tag}>")
        except ET.ParseError as e:
            errors.append(f"Malformed root XML: {e}")
            root_tree = None

    # 2. Check All XML Files for syntax errors
    xml_files = []
    for dirpath, _, filenames in os.walk(apiproxy_dir):
        for f in filenames:
            if f.endswith(".xml"):
                full_path = os.path.join(dirpath, f)
                xml_files.append(full_path)
                try:
                    ET.parse(full_path)
                except ET.ParseError as e:
                    rel = os.path.relpath(full_path, apiproxy_dir)
                    errors.append(f"Malformed XML in {rel}: {e}")

    # 3. Cross-reference Policies & Resources
    policies_dir = os.path.join(apiproxy_dir, "policies")
    existing_policies = set()
    jsc_dir = os.path.join(apiproxy_dir, "resources", "jsc")
    existing_resources = set()
    if os.path.isdir(jsc_dir):
        existing_resources = {f"jsc://{f}" for f in os.listdir(jsc_dir) if f.endswith(".js")}

    if os.path.isdir(policies_dir):
        for f in os.listdir(policies_dir):
            if f.endswith(".xml"):
                pname = os.path.splitext(f)[0]
                existing_policies.add(pname)
                pfile = os.path.join(policies_dir, f)
                try:
                    pt = ET.parse(pfile).getroot()
                    attr_name = pt.attrib.get("name")
                    if attr_name != pname:
                        errors.append(f"Policy {f} has mismatched name='{attr_name}' (expected '{pname}')")
                    res_url = pt.find("ResourceURL")
                    if res_url is not None and res_url.text:
                        rtext = res_url.text.strip()
                        if rtext not in existing_resources:
                            errors.append(f"Policy {f} references missing resource: {rtext}")
                except Exception:
                    pass

    # Check policies defined in root XML
    if root_tree:
        declared_policies = {p.text.strip() for p in root_tree.findall(".//Policies/Policy") if p.text}
        missing_in_dir = declared_policies - existing_policies
        if missing_in_dir:
            errors.append(f"Policies declared in root XML but missing in policies/: {', '.join(sorted(missing_in_dir))}")
        unregistered = existing_policies - declared_policies
        if unregistered:
            errors.append(f"Policies in policies/ but not declared in root XML: {', '.join(sorted(unregistered))}")

        declared_resources = {r.text.strip() for r in root_tree.findall(".//Resources/Resource") if r.text}
        missing_res = declared_resources - existing_resources
        if missing_res:
            errors.append(f"Resources declared in root XML but missing: {', '.join(sorted(missing_res))}")
        unregistered_res = existing_resources - declared_resources
        if unregistered_res:
            errors.append(f"Resources in resources/jsc/ but not declared in root XML: {', '.join(sorted(unregistered_res))}")

    # 4. Check Policies referenced across ProxyEndpoints and TargetEndpoints
    referenced_steps = set()
    default_proxy_xml = os.path.join(apiproxy_dir, "proxies", "default.xml")
    if os.path.exists(default_proxy_xml):
        try:
            ptree = ET.parse(default_proxy_xml)
            proxy_steps = {s.text.strip() for s in ptree.findall(".//Step/Name") if s.text}
            referenced_steps.update(proxy_steps)
            missing_steps = proxy_steps - existing_policies
            if missing_steps:
                errors.append(f"ProxyEndpoint references nonexistent policies: {', '.join(sorted(missing_steps))}")
        except Exception as e:
            errors.append(f"Failed to inspect proxies/default.xml: {e}")

    targets_dir = os.path.join(apiproxy_dir, "targets")
    existing_targets = set()
    if os.path.isdir(targets_dir):
        for f in os.listdir(targets_dir):
            if f.endswith(".xml"):
                tname = os.path.splitext(f)[0]
                existing_targets.add(tname)
                tfile = os.path.join(targets_dir, f)
                try:
                    ttree = ET.parse(tfile)
                    t_steps = {s.text.strip() for s in ttree.findall(".//Step/Name") if s.text}
                    referenced_steps.update(t_steps)
                    missing_t_steps = t_steps - existing_policies
                    if missing_t_steps:
                        errors.append(f"TargetEndpoint {f} references nonexistent policies: {', '.join(sorted(missing_t_steps))}")
                except Exception as e:
                    errors.append(f"Failed to inspect targets/{f}: {e}")

    unattached_policies = existing_policies - referenced_steps
    if unattached_policies:
        errors.append(f"Unattached policies (not referenced in any ProxyEndpoint or TargetEndpoint): {', '.join(sorted(unattached_policies))}")

    # 5. Check TargetEndpoints in root XML and RouteRules
    if root_tree:
        declared_targets = {t.text.strip() for t in root_tree.findall(".//TargetEndpoints/TargetEndpoint") if t.text}
        missing_targets = declared_targets - existing_targets
        if missing_targets:
            errors.append(f"Targets declared in root XML but missing in targets/: {', '.join(sorted(missing_targets))}")
        unregistered_targets = existing_targets - declared_targets
        if unregistered_targets:
            errors.append(f"Targets in targets/ but not declared in root XML: {', '.join(sorted(unregistered_targets))}")

    if os.path.exists(default_proxy_xml):
        try:
            ptree = ET.parse(default_proxy_xml)
            for rr in ptree.findall(".//RouteRule"):
                te = rr.find("TargetEndpoint")
                if te is not None and te.text:
                    tname = te.text.strip()
                    if tname not in existing_targets:
                        errors.append(f"RouteRule references unknown TargetEndpoint: {tname}")
        except Exception:
            pass

    if errors:
        print(f"\n❌ Validation FAILED with {len(errors)} error(s):")
        for err in errors:
            print(f"  - {err}")
        sys.exit(1)

    print(f"\n✅ All checks PASSED! Proxy bundle '{proxy_name}' is valid and ready for packaging.")
    print(f"   - XML files checked: {len(xml_files)}")
    print(f"   - Policies checked:  {len(existing_policies)} (0 unattached)")
    print(f"   - Resources checked: {len(existing_resources)}")
    print(f"   - Targets checked:   {len(existing_targets)}")

if __name__ == "__main__":
    validate()
