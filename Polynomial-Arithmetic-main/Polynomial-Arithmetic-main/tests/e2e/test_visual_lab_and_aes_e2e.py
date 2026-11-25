"""Browser checks for the AES S-box walkthrough and the Visual lab (dynamic field explorer)."""
from __future__ import annotations

import pytest


def test_aes_sbox_walkthrough_in_browser(live_url: str) -> None:
    """FIPS 197 known answers: {53} -> inverse {CA} -> {ED}, and the zero rule {00} -> {63}."""
    playwright = pytest.importorskip("playwright.sync_api")
    check = playwright.expect
    with playwright.sync_playwright() as runner:
        browser = runner.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        errors: list[str] = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(live_url)
        page.get_by_role("link", name="AES S-box", exact=True).click()
        page.locator("#aes-example").click()
        check(page.locator("#aes-pipeline")).to_contain_text("CA")
        check(page.locator("#aes-pipeline")).to_contain_text("ED")
        check(page.locator("#aes-affine")).to_be_visible()
        page.locator("#aes-zero").click()
        check(page.locator("#aes-pipeline")).to_contain_text("63")
        check(page.locator("#aes-euclid")).to_be_hidden()
        assert errors == []
        browser.close()


def test_visual_lab_relations_follow_any_input(live_url: str) -> None:
    """The Visual lab accepts hex, binary and polynomial input and updates every relation card."""
    playwright = pytest.importorskip("playwright.sync_api")
    check = playwright.expect
    with playwright.sync_playwright() as runner:
        browser = runner.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        errors: list[str] = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(live_url)
        page.get_by_role("link", name="Visual lab", exact=True).click()

        relations = page.locator(".vl-rel-value")
        # Default AES field: {57} + {83} = {D4}, {57} x {83} = {C1}.
        check(relations.nth(0)).to_have_text("{D4}")
        check(relations.nth(1)).to_have_text("{C1}")

        # Polynomial and binary input give the same element.
        page.locator("#vl-a").fill("x^6 + x^4 + x^2 + x + 1")
        page.locator("#vl-b").fill("0b10000011")
        check(relations.nth(1)).to_have_text("{C1}")

        # GF(2^4) with m(x) = x^4 + x^3 + 1: 9 / 4 = 4 (g^4 / g^2 = g^2), inverse of 0 is undefined.
        page.locator("#vl-field").select_option("4")
        page.locator("#vl-a").fill("9")
        page.locator("#vl-b").fill("4")
        check(relations.nth(2)).to_have_text("{4}")
        page.locator("#vl-a").fill("0")
        check(relations.nth(3)).to_have_text("n/a")

        # Values wider than the field are reduced, with an explanation.
        page.locator("#vl-field").select_option("8")
        page.locator("#vl-a").fill("1F3")
        check(page.locator("#vl-card-a .vl-note")).to_contain_text("reduced mod m(x)")

        # Bad input is explained, not silently accepted.
        page.locator("#vl-b").fill("hello")
        check(page.locator("#vl-card-b .vl-error")).to_be_visible()
        assert errors == []
        browser.close()
