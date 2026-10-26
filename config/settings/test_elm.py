"""Isolated ELM tests without copying the host's template1 database."""
from copy import deepcopy

from .test import *

DATABASES = deepcopy(DATABASES)
DATABASES["default"].setdefault("TEST", {})["TEMPLATE"] = "template0"
