try:
    from ._version import __version__
except ImportError:
    # Package used outside an editable install (e.g. straight from the source tree).
    import warnings

    warnings.warn("Importing 'graphit_jupyter' outside a proper installation.")
    __version__ = "dev"


def _jupyter_labextension_paths():
    """
    Tells JupyterLab where to find the prebuilt labextension of this package.
    :return: List with one entry mapping the bundled labextension directory to its install name
    """
    return [{"src": "labextension", "dest": "graphit-jupyter"}]
